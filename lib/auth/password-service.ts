// Forgot / reset / change password (Auth PRD §3.3, PWD-01..04, AUTH-06).
import { audit } from "@/lib/audit";
import { addMs, now } from "@/lib/clock";
import { enqueueEmail } from "@/lib/email/outbox";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { displayName, rolesOf } from "@/lib/users/dto";
import { setPassword, verifyUserPassword } from "./credentials";
import { issueAccessFor, issueSession, type IssuedTokens } from "./issue";
import { checkPassword, type PasswordProblem } from "./password-policy";
import { hit, LIMITS } from "./rate-limit";
import { revokeAllSessions, rotateSession, type SessionMeta } from "./session-service";
import { RESET_TTL_MS, consumeToken, inspectToken, issueToken, revokeOpenTokens } from "./token-service";
import { LOCK_DURATION_MS, MAX_FAILED_ATTEMPTS } from "./login-service";

type Tx = Prisma.TransactionClient;

/** PWD-01..03. Always resolves the same way; only ACTIVE accounts get an email. */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: email.trim() } });
  if (!user || user.status !== "ACTIVE") return;
  const allowed = await hit(LIMITS.resetEmailPerAccount, user.id);
  if (!allowed.allowed) return;

  await prisma.$transaction(async (tx) => {
    const token = await issueToken(tx, { userId: user.id, type: "RESET", createdById: null });
    await enqueueEmail(tx, {
      template: "RESET",
      toUserId: user.id,
      toEmail: user.email,
      locale: user.locale,
      payload: { token, firstName: displayName(user), expiresAt: addMs(now(), RESET_TTL_MS).toISOString() },
      dedupeKey: `reset:${user.id}:${now().getTime()}`,
    });
  });
}

async function queuePasswordChanged(tx: Tx, user: { id: string; email: string; locale: "bn" | "en"; firstName: string | null; lastName: string | null; name: string; username: string }) {
  const t = now();
  await enqueueEmail(tx, {
    template: "PASSWORD_CHANGED",
    toUserId: user.id,
    toEmail: user.email,
    locale: user.locale,
    payload: { firstName: displayName(user), changedAt: t.toISOString() },
    dedupeKey: `password-changed:${user.id}:${t.getTime()}`,
  });
}

export type ResetResult =
  | { ok: true; tokens: IssuedTokens }
  | { ok: false; code: "TOKEN_EXPIRED" | "TOKEN_USED" }
  | { ok: false; code: "WEAK_PASSWORD"; reason: PasswordProblem };

export async function resetPassword(input: { token: string; password: string }, meta: SessionMeta): Promise<ResetResult> {
  const inspection = await inspectToken(input.token, "RESET");
  if (inspection.status !== "VALID") return { ok: false, code: inspection.status === "USED" ? "TOKEN_USED" : "TOKEN_EXPIRED" };
  const { token } = inspection;
  if (token.user.status !== "ACTIVE") return { ok: false, code: "TOKEN_USED" };

  const policy = checkPassword(input.password, { username: token.user.username, email: token.user.email });
  if (!policy.ok) return { ok: false, code: "WEAK_PASSWORD", reason: policy.reason };

  return prisma.$transaction(async (tx) => {
    if (!(await consumeToken(tx, token.id))) return { ok: false as const, code: "TOKEN_USED" as const };
    await setPassword(tx, token.userId, input.password);
    const user = await tx.user.update({
      where: { id: token.userId },
      data: { failedLoginCount: 0, lockedUntil: null, passwordChangedAt: now(), tokenVersion: { increment: 1 } },
      include: { roles: true },
    });
    const revoked = await revokeAllSessions(tx, user.id, "password_reset");
    await queuePasswordChanged(tx, user);
    await audit(tx, { actorId: user.id, action: "auth.password.reset", entityType: "user", entityId: user.id, after: { sessionsRevoked: revoked }, ...meta });
    const tokens = await issueSession(tx, { id: user.id, tokenVersion: user.tokenVersion, roles: rolesOf(user) }, { remember: false, ...meta });
    return { ok: true as const, tokens };
  });
}

export type ChangeResult =
  | { ok: true; tokens: IssuedTokens }
  | { ok: false; code: "INVALID_CREDENTIALS" | "ACCOUNT_LOCKED"; retryAfter?: number }
  | { ok: false; code: "WEAK_PASSWORD"; reason: PasswordProblem };

/**
 * PWD-04 + AUTH-06: needs the current password (wrong ones count toward the
 * lock), revokes every other session and rotates the current one so the
 * caller keeps a session that carries the new token_version.
 */
export async function changePassword(
  input: { userId: string; sessionId: string; refreshToken: string | null; currentPassword: string; newPassword: string },
  meta: SessionMeta,
): Promise<ChangeResult> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: input.userId } });
  const t = now();
  if (user.lockedUntil && user.lockedUntil > t) {
    return { ok: false, code: "ACCOUNT_LOCKED", retryAfter: Math.ceil((user.lockedUntil.getTime() - t.getTime()) / 1000) };
  }
  const { valid } = await verifyUserPassword(user.id, input.currentPassword);
  if (!valid) {
    const [row] = await prisma.$queryRaw<{ failed_login_count: number }[]>`
      UPDATE users SET failed_login_count = failed_login_count + 1, updated_at = now()
      WHERE id = ${user.id}::uuid RETURNING failed_login_count`;
    if (row.failed_login_count >= MAX_FAILED_ATTEMPTS) {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: addMs(now(), LOCK_DURATION_MS) } });
        await audit(tx, { actorId: user.id, action: "auth.locked", entityType: "user", entityId: user.id, reason: "change_password", ...meta });
      });
    }
    return { ok: false, code: "INVALID_CREDENTIALS" };
  }

  const policy = checkPassword(input.newPassword, { username: user.username, email: user.email });
  if (!policy.ok) return { ok: false, code: "WEAK_PASSWORD", reason: policy.reason };

  const updated = await prisma.$transaction(async (tx) => {
    await setPassword(tx, user.id, input.newPassword);
    const u = await tx.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, passwordChangedAt: now(), tokenVersion: { increment: 1 } },
      include: { roles: true },
    });
    const revoked = await revokeAllSessions(tx, user.id, "password_changed", { exceptSessionId: input.sessionId });
    // A reset link mailed before the change must not be able to overwrite it.
    await revokeOpenTokens(tx, user.id, "RESET");
    await queuePasswordChanged(tx, u);
    await audit(tx, { actorId: user.id, action: "auth.password.changed", entityType: "user", entityId: user.id, after: { otherSessionsRevoked: revoked }, ...meta });
    return u;
  });

  // Keep the current device signed in: rotate its refresh token and mint an
  // access token with the new token_version.
  const rotated = input.refreshToken ? await rotateSession({ refreshToken: input.refreshToken, ...meta }) : null;
  if (rotated?.ok) {
    return { ok: true, tokens: await issueAccessFor({ id: updated.id, tokenVersion: updated.tokenVersion, roles: rolesOf(updated) }, rotated.session.id, rotated.refreshToken, rotated.session.remember) };
  }
  // No usable refresh cookie: start a fresh session instead.
  const session = await prisma.authSession.findUnique({ where: { id: input.sessionId } });
  const tokens = await issueSession(prisma, { id: updated.id, tokenVersion: updated.tokenVersion, roles: rolesOf(updated) }, { remember: session?.remember ?? false, ...meta });
  if (session) await prisma.authSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: now(), revokedReason: "password_changed" } });
  return { ok: true, tokens };
}
