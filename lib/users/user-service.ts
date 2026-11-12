// User writes shared by /me and /users. Every write: one transaction with
// its audit row (and outbox row when an email is due).
import type { Prisma, User } from "@/lib/generated/prisma/client";
import { Abort } from "@/lib/api/in-transaction";
import { isFail, type Fail } from "@/lib/api/result";
import { prepareAvatar, setAvatar } from "@/lib/attachments/avatar-service";
import { audit } from "@/lib/audit";
import { currentPropertyId } from "@/lib/property";
import { prisma } from "@/lib/prisma";
import type { SessionMeta } from "@/lib/auth/session-service";
import { revokeOpenTokens } from "@/lib/auth/token-service";
import { displayName } from "./dto";

type Tx = Prisma.TransactionClient;

export type ProfilePatch = {
  /** Notices & complaints emails that may be turned off (Notices & Complaints PRD §11). */
  emailNotices?: boolean;
  username?: string;
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
  surname?: string | null;
  birthday?: string | null;
  profession?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  whatsappSameAsPhone?: boolean;
  houseResponsibility?: string | null;
  locale?: "bn" | "en";
  /** Profile photo upload to set (uuid), `null` to remove, omitted to keep (add-profile-photo). */
  avatarId?: string | null;
};

export type Conflict = "USERNAME_TAKEN" | "EMAIL_TAKEN";

export async function findConflict(
  db: Tx | typeof prisma,
  input: { username?: string; email?: string },
  exceptUserId?: string,
): Promise<Conflict | null> {
  const not = exceptUserId ? { NOT: { id: exceptUserId } } : {};
  if (input.username && (await db.user.findFirst({ where: { username: input.username, ...not }, select: { id: true } }))) {
    return "USERNAME_TAKEN";
  }
  if (input.email && (await db.user.findFirst({ where: { email: input.email, ...not }, select: { id: true } }))) {
    return "EMAIL_TAKEN";
  }
  return null;
}

/** Maps a unique-constraint violation that slipped past the pre-check (race). */
export function conflictFromError(err: unknown): Conflict | null {
  const e = err as { code?: string; meta?: { target?: unknown; constraint?: unknown } };
  if (e?.code !== "P2002") return null;
  // Only look at the constraint target, never the free-text message (it can
  // quote the whole query, which mentions every field).
  const target = JSON.stringify(e.meta?.target ?? e.meta?.constraint ?? "");
  return /email/i.test(target) ? "EMAIL_TAKEN" : "USERNAME_TAKEN";
}

function toData(patch: ProfilePatch, current: User): Prisma.UserUpdateInput {
  const data: Prisma.UserUpdateInput = {};
  for (const key of ["firstName", "lastName", "surname", "profession", "houseResponsibility", "locale", "phone", "whatsapp", "whatsappSameAsPhone", "emailNotices"] as const) {
    if (patch[key] !== undefined) (data as Record<string, unknown>)[key] = patch[key];
  }
  if (patch.birthday !== undefined) data.birthday = patch.birthday ? new Date(`${patch.birthday}T00:00:00Z`) : null;
  if (patch.username !== undefined) {
    data.username = patch.username;
    data.displayUsername = patch.username;
  }
  if (patch.email !== undefined) data.email = patch.email;

  const sameAsPhone = patch.whatsappSameAsPhone ?? current.whatsappSameAsPhone;
  if (sameAsPhone) data.whatsapp = patch.phone !== undefined ? patch.phone : current.phone;

  const next = { ...current, ...data } as User;
  if (patch.firstName !== undefined || patch.lastName !== undefined || patch.username !== undefined) {
    data.name = displayName(next);
  }
  return data;
}

function diff(before: User, after: User) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  const keys = ["username", "email", "firstName", "lastName", "surname", "birthday", "profession", "phone", "whatsapp", "whatsappSameAsPhone", "houseResponsibility", "locale", "emailNotices"] as const;
  for (const k of keys) {
    const bv = before[k] instanceof Date ? (before[k] as Date).toISOString().slice(0, 10) : before[k];
    const av = after[k] instanceof Date ? (after[k] as Date).toISOString().slice(0, 10) : after[k];
    if (bv !== av) {
      b[k] = bv;
      a[k] = av;
    }
  }
  return { before: b, after: a };
}

export type UpdateResult = { ok: true; user: User & { roles: { role: string }[] }; emailChanged: boolean } | Fail;

/**
 * Verifies a requested photo change before the write transaction (it reads
 * storage). Returns the property to link it in, or the 422 failure.
 */
export async function preparePhoto(avatarId: string | null | undefined, actorId: string): Promise<{ propertyId: string } | Fail | null> {
  if (avatarId === undefined) return null;
  const propertyId = await currentPropertyId();
  if (avatarId === null) return { propertyId };
  return (await prepareAvatar(propertyId, avatarId, actorId)) ?? { propertyId };
}


export async function updateUserProfile(
  userId: string,
  patch: ProfilePatch,
  actor: { id: string } & SessionMeta,
): Promise<UpdateResult> {
  const conflict = await findConflict(prisma, patch, userId);
  if (conflict) return { ok: false, code: conflict };
  const photo = await preparePhoto(patch.avatarId, actor.id);
  if (isFail(photo)) return photo;
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { id: userId } });
      if (!current) return { ok: false as const, code: "NOT_FOUND" as const };
      // Its own audit row (user.avatar.*); never part of the user.updated diff.
      if (photo) await setAvatar(tx, photo.propertyId, userId, patch.avatarId ?? null, actor);
      const updated = await tx.user.update({ where: { id: userId }, data: toData(patch, current), include: { roles: true } });
      const changes = diff(current, updated);
      const emailChanged = current.email.toLowerCase() !== updated.email.toLowerCase();
      // Links already mailed to the old address must stop working.
      if (emailChanged) await revokeOpenTokens(tx, userId);
      if (Object.keys(changes.after).length > 0) {
        await audit(tx, {
          actorId: actor.id,
          action: "user.updated",
          entityType: "user",
          entityId: userId,
          ...changes,
          ip: actor.ip,
          userAgent: actor.userAgent,
        });
      }
      return { ok: true as const, user: updated, emailChanged };
    });
  } catch (err) {
    if (err instanceof Abort) return err.fail;
    const c = conflictFromError(err);
    if (c) return { ok: false, code: c };
    throw err;
  }
}
