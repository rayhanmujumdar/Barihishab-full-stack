// Refresh-session store (design D2): one `sessions` row per refresh token,
// rotated on every refresh. A rotated token presented again after the grace
// window is treated as theft and revokes the whole family.
import { randomUUID } from "node:crypto";
import type { AuthSession, Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { DAY, HOUR, MINUTE, SECOND, addMs, now } from "@/lib/clock";
import { generateOpaqueToken, hashToken } from "./tokens";

type Db = Prisma.TransactionClient | typeof prisma;

export const REMEMBER_TTL_MS = 30 * DAY;
export const IDLE_TTL_MS = 12 * HOUR;
export const ABSOLUTE_TTL_MS = 7 * DAY;
export const REUSE_GRACE_MS = 30 * SECOND;
/** Parallel refreshes tolerated per rotated token inside the grace window. */
export const MAX_GRACE_SIBLINGS = 3;
const TOUCH_THROTTLE_MS = 5 * MINUTE;

export type SessionMeta = { ip?: string | null; userAgent?: string | null };

export function isActive(s: Pick<AuthSession, "revokedAt" | "expiresAt" | "idleExpiresAt">, at = now()): boolean {
  if (s.revokedAt) return false;
  if (s.expiresAt <= at) return false;
  if (s.idleExpiresAt && s.idleExpiresAt <= at) return false;
  return true;
}

async function insertSession(
  db: Db,
  data: { userId: string; familyId: string; remember: boolean; expiresAt: Date } & SessionMeta,
) {
  const t = now();
  const refreshToken = generateOpaqueToken();
  const session = await db.authSession.create({
    data: {
      userId: data.userId,
      familyId: data.familyId,
      tokenHash: hashToken(refreshToken),
      remember: data.remember,
      ip: data.ip ?? null,
      userAgent: data.userAgent?.slice(0, 512) ?? null,
      createdAt: t,
      lastSeenAt: t,
      idleExpiresAt: data.remember ? null : addMs(t, IDLE_TTL_MS),
      expiresAt: data.expiresAt,
    },
  });
  return { session, refreshToken };
}

export async function createSession(
  input: { userId: string; remember: boolean } & SessionMeta,
  db: Db = prisma,
) {
  const t = now();
  return insertSession(db, {
    ...input,
    familyId: randomUUID(),
    expiresAt: addMs(t, input.remember ? REMEMBER_TTL_MS : ABSOLUTE_TTL_MS),
  });
}

export type RotateResult =
  | { ok: true; session: AuthSession; refreshToken: string; userId: string }
  | { ok: false; reason: "INVALID" | "EXPIRED" | "REVOKED" | "REUSED" | "INACTIVE"; userId?: string };

export async function rotateSession(input: { refreshToken: string } & SessionMeta, retried = false): Promise<RotateResult> {
  if (!input.refreshToken) return { ok: false, reason: "INVALID" };
  const t = now();
  const current = await prisma.authSession.findUnique({
    where: { tokenHash: hashToken(input.refreshToken) },
    include: { user: { select: { status: true } } },
  });
  if (!current) return { ok: false, reason: "INVALID" };
  const userId = current.userId;

  if (current.rotatedAt) return graceRefresh(current, input, t);

  if (current.revokedAt) return { ok: false, reason: "REVOKED", userId };
  if (!isActive(current, t)) return { ok: false, reason: "EXPIRED", userId };
  if (current.user.status !== "ACTIVE") {
    await revokeFamily(current.familyId, "user_inactive");
    return { ok: false, reason: "INACTIVE", userId };
  }

  const won = await prisma.$transaction(async (tx) => {
    // Compare-and-set: only one concurrent refresh can win the rotation.
    const claimed = await tx.authSession.updateMany({
      where: { id: current.id, rotatedAt: null, revokedAt: null },
      data: { rotatedAt: t, revokedAt: t, revokedReason: "rotated" },
    });
    if (claimed.count !== 1) return null;
    const next = await insertSession(tx, {
      userId,
      familyId: current.familyId,
      remember: current.remember,
      expiresAt: current.expiresAt, // absolute lifetime never extends
      ip: input.ip ?? current.ip,
      userAgent: input.userAgent ?? current.userAgent,
    });
    await tx.authSession.update({ where: { id: current.id }, data: { replacedById: next.session.id } });
    return { ok: true as const, ...next, userId };
  });
  if (won) return won;
  // Lost the race to a parallel refresh of the same token (two tabs, or a page
  // load plus an RSC request): re-read and take the grace path instead of
  // treating it as a revocation.
  return retried ? { ok: false, reason: "REVOKED", userId } : rotateSession(input, true);
}

/**
 * A token that was already rotated. Within REUSE_GRACE_MS it is a benign
 * parallel refresh: we only store hashes, so the successor's raw token can't
 * be handed back; mint a sibling in the same family instead (at most
 * MAX_GRACE_SIBLINGS). Anything else is replay of a stolen token.
 */
async function graceRefresh(
  current: AuthSession & { user: { status: string } },
  input: SessionMeta,
  t: Date,
): Promise<RotateResult> {
  const userId = current.userId;
  const rotatedAt = current.rotatedAt!;
  const result = await prisma.$transaction(async (tx) => {
    // Serialise grace decisions per family so parallel replays can't all slip under the cap.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${current.familyId}))`;
    const withinGrace = t.getTime() - rotatedAt.getTime() <= REUSE_GRACE_MS;
    const familyAlive = (await tx.authSession.count({ where: { familyId: current.familyId, revokedAt: null } })) > 0;
    const siblings = await tx.authSession.count({
      where: {
        familyId: current.familyId,
        createdAt: { gte: rotatedAt },
        id: { notIn: [current.id, ...(current.replacedById ? [current.replacedById] : [])] },
      },
    });
    const idleOk = !current.idleExpiresAt || current.idleExpiresAt > rotatedAt;
    if (withinGrace && familyAlive && siblings < MAX_GRACE_SIBLINGS && idleOk && current.user.status === "ACTIVE" && current.expiresAt > t) {
      const sibling = await insertSession(tx, {
        userId,
        familyId: current.familyId,
        remember: current.remember,
        expiresAt: current.expiresAt,
        ip: input.ip ?? current.ip,
        userAgent: input.userAgent ?? current.userAgent,
      });
      return { ok: true as const, ...sibling, userId };
    }
    return null;
  });
  if (result) return result;
  await revokeFamily(current.familyId, "refresh_reuse");
  return { ok: false, reason: "REUSED", userId };
}

export async function findActiveSession(id: string, db: Db = prisma): Promise<AuthSession | null> {
  const s = await db.authSession.findUnique({ where: { id } });
  return s && isActive(s) ? s : null;
}

export async function revokeSession(id: string, reason: string, db: Db = prisma): Promise<boolean> {
  const res = await db.authSession.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: now(), revokedReason: reason },
  });
  return res.count > 0;
}

export async function revokeFamily(familyId: string, reason: string, db: Db = prisma): Promise<number> {
  const res = await db.authSession.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: now(), revokedReason: reason },
  });
  return res.count;
}

export async function revokeAllSessions(
  db: Db,
  userId: string,
  reason: string,
  opts: { exceptSessionId?: string } = {},
): Promise<number> {
  const res = await db.authSession.updateMany({
    where: { userId, revokedAt: null, ...(opts.exceptSessionId ? { NOT: { id: opts.exceptSessionId } } : {}) },
    data: { revokedAt: now(), revokedReason: reason },
  });
  return res.count;
}

/** Updates last_seen_at at most once per 5 minutes (Auth PRD §8). */
export async function touchSession(s: Pick<AuthSession, "id" | "lastSeenAt">): Promise<void> {
  const t = now();
  if (t.getTime() - s.lastSeenAt.getTime() < TOUCH_THROTTLE_MS) return;
  await prisma.authSession.updateMany({
    where: { id: s.id, lastSeenAt: { lt: addMs(t, -TOUCH_THROTTLE_MS) } },
    data: { lastSeenAt: t },
  });
}

export function listActiveSessions(userId: string) {
  const t = now();
  return prisma.authSession.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: t },
      OR: [{ idleExpiresAt: null }, { idleExpiresAt: { gt: t } }],
    },
    orderBy: { lastSeenAt: "desc" },
  });
}
