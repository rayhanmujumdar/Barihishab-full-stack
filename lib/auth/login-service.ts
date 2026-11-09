// Login (Auth PRD §3.2): rate limit → find user (case-insensitive) → lock
// check → verify hash → status ACTIVE. Failures never say why.
import { audit } from "@/lib/audit";
import { addMs, MINUTE, now } from "@/lib/clock";
import { prisma } from "@/lib/prisma";
import { rolesOf } from "@/lib/users/dto";
import { findUserByIdentifier, setPassword, verifyUserPassword } from "./credentials";
import { issueSession, type IssuedTokens } from "./issue";
import type { SessionMeta } from "./session-service";

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * MINUTE;
const HINT_FROM_ATTEMPT = 3;

export type LoginResult =
  | { ok: true; userId: string; tokens: IssuedTokens }
  | { ok: false; code: "INVALID_CREDENTIALS"; attemptsLeft?: number }
  | { ok: false; code: "ACCOUNT_LOCKED"; retryAfter: number };

function failureDelay() {
  const ms = Number(process.env.AUTH_FAILURE_DELAY_MS ?? 250);
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

export async function login(
  input: { identifier: string; password: string; remember: boolean },
  meta: SessionMeta,
): Promise<LoginResult> {
  const t = now();
  const user = await findUserByIdentifier(input.identifier);

  if (user?.lockedUntil && user.lockedUntil > t) {
    await verifyUserPassword(null, input.password); // same Argon2 cost as a real check
    await failureDelay();
    return { ok: false, code: "ACCOUNT_LOCKED", retryAfter: Math.ceil((user.lockedUntil.getTime() - t.getTime()) / 1000) };
  }

  const { valid, rehash } = await verifyUserPassword(user?.id ?? null, input.password);

  if (!user || !valid || user.status !== "ACTIVE") {
    const result = await recordFailure(user && user.status === "ACTIVE" && !valid ? user.id : null, user?.id ?? null, meta);
    await failureDelay();
    return result;
  }

  const roles = rolesOf(user);
  const tokens = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: t },
    });
    if (rehash) await setPassword(tx, user.id, input.password);
    const issued = await issueSession(tx, { id: user.id, tokenVersion: user.tokenVersion, roles }, { remember: input.remember, ...meta });
    await audit(tx, {
      actorId: user.id,
      action: "auth.login.success",
      entityType: "user",
      entityId: user.id,
      after: { sessionId: issued.sessionId, remember: input.remember },
      ...meta,
    });
    return issued;
  });
  return { ok: true, userId: user.id, tokens };
}

/**
 * `countFor` = user whose wrong password counts toward the lock (ACTIVE accounts only).
 * The counter is bumped atomically so parallel attempts can't skip the lock.
 */
async function recordFailure(countFor: string | null, entityId: string | null, meta: SessionMeta): Promise<LoginResult> {
  if (!countFor) {
    await audit(prisma, { action: "auth.login.failed", entityType: "user", entityId, actorId: null, ...meta });
    return { ok: false, code: "INVALID_CREDENTIALS" };
  }
  return prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ failed_login_count: number }[]>`
      UPDATE users SET failed_login_count = failed_login_count + 1, updated_at = now()
      WHERE id = ${countFor}::uuid RETURNING failed_login_count`;
    const count = row.failed_login_count;
    await audit(tx, { action: "auth.login.failed", entityType: "user", entityId: countFor, actorId: null, after: { attempt: count }, ...meta });

    if (count >= MAX_FAILED_ATTEMPTS) {
      const lockedUntil = addMs(now(), LOCK_DURATION_MS);
      await tx.user.update({ where: { id: countFor }, data: { failedLoginCount: 0, lockedUntil } });
      await audit(tx, { action: "auth.locked", entityType: "user", entityId: countFor, actorId: null, after: { lockedUntil }, ...meta });
      return { ok: false as const, code: "ACCOUNT_LOCKED" as const, retryAfter: LOCK_DURATION_MS / 1000 };
    }
    return {
      ok: false as const,
      code: "INVALID_CREDENTIALS" as const,
      attemptsLeft: count >= HINT_FROM_ATTEMPT ? MAX_FAILED_ATTEMPTS - count : undefined,
    };
  });
}
