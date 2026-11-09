// Super Admin user management (USR-01..05, Auth PRD §2 hard rules).
// Role/status changes take one advisory lock so the last-Super-Admin rule
// can't be raced (two admins demoting each other at the same time).
import type { Prisma, Role as DbRole, UserStatus } from "@/lib/generated/prisma/client";
import { audit } from "@/lib/audit";
import { addMs, now } from "@/lib/clock";
import { hasPassword } from "@/lib/auth/credentials";
import { revokeAllSessions, type SessionMeta } from "@/lib/auth/session-service";
import { INVITE_TTL_MS, issueToken, revokeOpenTokens } from "@/lib/auth/token-service";
import { enqueueEmail } from "@/lib/email/outbox";
import type { EnabledRole } from "@/lib/permissions";
import { logError } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { displayName, rolesOf } from "./dto";
import { conflictFromError, findConflict, updateUserProfile, type Conflict, type ProfilePatch } from "./user-service";

type Tx = Prisma.TransactionClient;
type Actor = { id: string } & SessionMeta;
const ROLE_LOCK = 4242002;

const USER_WITH_ROLES = { roles: true } as const;

async function lockRoles(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ROLE_LOCK})`;
}

async function activeSuperAdminIds(tx: Tx | typeof prisma): Promise<string[]> {
  const rows = await tx.userRole.findMany({
    where: { role: "SUPER_ADMIN", user: { status: "ACTIVE" } },
    select: { userId: true },
    distinct: ["userId"],
  });
  return rows.map((r) => r.userId);
}

export function countActiveSuperAdmins() {
  return activeSuperAdminIds(prisma).then((ids) => ids.length);
}

async function sendInvite(tx: Tx, user: { id: string; email: string; locale: "bn" | "en"; firstName: string | null; lastName: string | null; name: string; username: string }, actor: Actor | null) {
  const token = await issueToken(tx, { userId: user.id, type: "INVITE", createdById: actor?.id ?? null });
  const inviter = actor ? await tx.user.findUnique({ where: { id: actor.id } }) : null;
  const t = now();
  await enqueueEmail(tx, {
    template: "INVITE",
    toUserId: user.id,
    toEmail: user.email,
    locale: user.locale,
    payload: {
      token,
      firstName: user.firstName ?? displayName(user),
      invitedBy: inviter ? displayName(inviter) : "BariHisab",
      expiresAt: addMs(t, INVITE_TTL_MS).toISOString(),
    },
    dedupeKey: `invite:${user.id}:${t.getTime()}`,
  });
  await audit(tx, { actorId: actor?.id ?? null, action: "auth.invite.sent", entityType: "user", entityId: user.id, ip: actor?.ip, userAgent: actor?.userAgent });
}

export type CreateUserInput = ProfilePatch & { username: string; email: string; role: EnabledRole; locale: "bn" | "en" };

export async function createInvitedUser(input: CreateUserInput, actor: Actor) {
  const conflict = await findConflict(prisma, input);
  if (conflict) return { ok: false as const, code: conflict };
  const { role, birthday, whatsappSameAsPhone, ...rest } = input;
  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          ...rest,
          displayUsername: input.username,
          name: displayName({ firstName: input.firstName ?? null, lastName: input.lastName ?? null, name: "", username: input.username }),
          birthday: birthday ? new Date(`${birthday}T00:00:00Z`) : null,
          whatsappSameAsPhone: whatsappSameAsPhone ?? false,
          whatsapp: whatsappSameAsPhone ? (input.phone ?? null) : (input.whatsapp ?? null),
          status: "INVITED",
          createdById: actor.id,
          roles: { create: { role, grantedById: actor.id } },
        },
        include: USER_WITH_ROLES,
      });
      await audit(tx, {
        actorId: actor.id,
        action: "user.created",
        entityType: "user",
        entityId: created.id,
        after: { username: created.username, email: created.email, roles: [role], locale: created.locale },
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
      await sendInvite(tx, created, actor);
      return created;
    });
    return { ok: true as const, user };
  } catch (err) {
    const c = conflictFromError(err);
    if (c) return { ok: false as const, code: c };
    throw err;
  }
}

export type ListQuery = { q?: string; role?: DbRole; status?: UserStatus; cursor?: string; limit: number };

export async function listUsers(query: ListQuery) {
  const q = query.q?.trim();
  const where: Prisma.UserWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.role ? { roles: { some: { role: query.role } } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { surname: { contains: q, mode: "insensitive" } },
            { username: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            ...(q.replace(/[\s-]/g, "") ? [{ phone: { contains: q.replace(/[\s-]/g, "") } }] : []),
          ],
        }
      : {}),
  };
  const rows = await prisma.user.findMany({
    where,
    include: USER_WITH_ROLES,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

export function getUser(id: string) {
  return prisma.user.findUnique({ where: { id }, include: USER_WITH_ROLES });
}

/** Admin edit: if an INVITED user's email changed, re-send the invite to the new address. */
export async function updateUserAsAdmin(targetId: string, patch: ProfilePatch, actor: Actor) {
  const result = await updateUserProfile(targetId, patch, actor);
  if (result.ok && result.emailChanged && result.user.status === "INVITED") {
    // Old links were already voided with the email change; if re-inviting fails
    // the admin can use "Resend invite" — don't fail the saved edit.
    await resendInvite(targetId, actor).catch((err) => logError("users.re-invite", err));
  }
  return result;
}

export type GuardCode = "NOT_FOUND" | "LAST_SUPER_ADMIN" | "CANNOT_REMOVE_OWN_ADMIN";

export async function setRoles(input: { targetId: string; roles: EnabledRole[]; actor: Actor }) {
  const roles = [...new Set(input.roles)];
  return prisma.$transaction(async (tx) => {
    await lockRoles(tx);
    const target = await tx.user.findUnique({ where: { id: input.targetId }, include: USER_WITH_ROLES });
    if (!target) return { ok: false as const, code: "NOT_FOUND" as GuardCode };
    const before = rolesOf(target);
    const losesAdmin = before.includes("SUPER_ADMIN") && !roles.includes("SUPER_ADMIN");

    if (losesAdmin && input.actor.id === target.id) return { ok: false as const, code: "CANNOT_REMOVE_OWN_ADMIN" as GuardCode };
    if (losesAdmin && target.status === "ACTIVE") {
      const others = (await activeSuperAdminIds(tx)).filter((id) => id !== target.id);
      if (others.length === 0) return { ok: false as const, code: "LAST_SUPER_ADMIN" as GuardCode };
    }

    await tx.userRole.deleteMany({ where: { userId: target.id } });
    await tx.userRole.createMany({ data: roles.map((role) => ({ userId: target.id, role, grantedById: input.actor.id })) });
    await tx.user.update({ where: { id: target.id }, data: { tokenVersion: { increment: 1 } } });
    await revokeAllSessions(tx, target.id, "role_changed");
    await audit(tx, {
      actorId: input.actor.id,
      action: "user.role.changed",
      entityType: "user",
      entityId: target.id,
      before: { roles: before },
      after: { roles },
      ip: input.actor.ip,
      userAgent: input.actor.userAgent,
    });
    const user = await tx.user.findUniqueOrThrow({ where: { id: target.id }, include: USER_WITH_ROLES });
    return { ok: true as const, user };
  });
}

export async function deactivateUser(input: { targetId: string; reason: string; actor: Actor }) {
  return prisma.$transaction(async (tx) => {
    await lockRoles(tx);
    const target = await tx.user.findUnique({ where: { id: input.targetId }, include: USER_WITH_ROLES });
    if (!target) return { ok: false as const, code: "NOT_FOUND" as GuardCode };
    if (target.status === "ACTIVE" && rolesOf(target).includes("SUPER_ADMIN")) {
      const others = (await activeSuperAdminIds(tx)).filter((id) => id !== target.id);
      if (others.length === 0) return { ok: false as const, code: "LAST_SUPER_ADMIN" as GuardCode };
    }
    const user = await tx.user.update({
      where: { id: target.id },
      data: { status: "INACTIVE", tokenVersion: { increment: 1 } },
      include: USER_WITH_ROLES,
    });
    const sessions = await revokeAllSessions(tx, target.id, "deactivated");
    const tokens = await revokeOpenTokens(tx, target.id);
    await audit(tx, {
      actorId: input.actor.id,
      action: "user.deactivated",
      entityType: "user",
      entityId: target.id,
      before: { status: target.status },
      after: { status: "INACTIVE", sessionsRevoked: sessions, openLinksRevoked: tokens },
      reason: input.reason,
      ip: input.actor.ip,
      userAgent: input.actor.userAgent,
    });
    return { ok: true as const, user };
  });
}

export async function reactivateUser(input: { targetId: string; reason: string; actor: Actor }) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: input.targetId } });
    if (!target) return { ok: false as const, code: "NOT_FOUND" as GuardCode };
    const status: UserStatus = (await hasPassword(target.id, tx)) ? "ACTIVE" : "INVITED";
    const user = await tx.user.update({
      where: { id: target.id },
      data: { status, failedLoginCount: 0, lockedUntil: null },
      include: USER_WITH_ROLES,
    });
    await audit(tx, {
      actorId: input.actor.id,
      action: "user.reactivated",
      entityType: "user",
      entityId: target.id,
      before: { status: target.status },
      after: { status },
      reason: input.reason,
      ip: input.actor.ip,
      userAgent: input.actor.userAgent,
    });
    return { ok: true as const, user };
  });
}

export async function resendInvite(targetId: string, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: targetId } });
    if (!user) return { ok: false as const, code: "NOT_FOUND" as const };
    if (user.status !== "INVITED") return { ok: false as const, code: "NOT_INVITED" as const };
    await sendInvite(tx, user, actor);
    return { ok: true as const };
  });
}

export async function revokeInvite(targetId: string, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: targetId } });
    if (!user) return { ok: false as const, code: "NOT_FOUND" as const };
    const revoked = await revokeOpenTokens(tx, targetId, "INVITE");
    await audit(tx, { actorId: actor.id, action: "auth.invite.revoked", entityType: "user", entityId: targetId, after: { revoked }, ip: actor.ip, userAgent: actor.userAgent });
    return { ok: true as const };
  });
}

export async function forceLogout(targetId: string, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: targetId } });
    if (!user) return { ok: false as const, code: "NOT_FOUND" as const };
    const revoked = await revokeAllSessions(tx, targetId, "forced_by_admin");
    await audit(tx, { actorId: actor.id, action: "user.sessions.revoked", entityType: "user", entityId: targetId, after: { revoked }, ip: actor.ip, userAgent: actor.userAgent });
    return { ok: true as const };
  });
}

export type { Conflict };
