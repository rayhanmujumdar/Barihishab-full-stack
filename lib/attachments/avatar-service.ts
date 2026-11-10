// Profile photos (add-profile-photo D1, D3, D4). A photo is an `attachments`
// row with entity_type 'user_avatar' in the same private bucket as bills, so
// it inherits soft removal, the same-origin file proxy and the unlinked-upload
// sweep. `users.avatar_attachment_id` points at the current one.
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/lib/generated/prisma/client";
import { Abort } from "@/lib/api/in-transaction";
import { failWith, fieldFail, type Actor, type Fail, type Result } from "@/lib/api/result";
import { audit } from "@/lib/audit";
import { addMs, now, SECOND } from "@/lib/clock";
import { isImageMime, matchesMime, SNIFF_BYTES } from "@/lib/files/magic";
import { prisma } from "@/lib/prisma";
import { storage, URL_TTL_SECONDS } from "@/lib/storage";

type Tx = Prisma.TransactionClient;

export const AVATAR_ENTITY = "user_avatar";
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const BAD_PHOTO = "Only JPG, PNG or WebP up to 2 MB.";
const UPLOAD_AGAIN = "Upload the photo again.";

export type AvatarPresign = { avatarId: string; uploadUrl: string; headers: Record<string, string>; expiresAt: string };

/** Unlinked photo upload owned by the caller (any of profile.update.self / user.create / user.update). */
export async function presignAvatarUpload(
  propertyId: string,
  input: { fileName: string; mime: string; size: number },
  actor: Actor,
): Promise<Result<AvatarPresign>> {
  if (input.size > AVATAR_MAX_BYTES) return { ...failWith("FILE_TOO_LARGE"), message: BAD_PHOTO };
  if (!isImageMime(input.mime)) return fieldFail("mime", BAD_PHOTO);
  const storageKey = `p/${propertyId}/avatar/${randomUUID()}`;
  const uploadUrl = await storage().presignPut(storageKey, input.mime, input.size);
  const row = await prisma.attachment.create({
    data: { propertyId, entityType: AVATAR_ENTITY, storageKey, fileName: input.fileName, mime: input.mime, sizeBytes: input.size, uploadedById: actor.id },
  });
  return {
    ok: true,
    avatarId: row.id,
    uploadUrl,
    headers: { "Content-Type": input.mime },
    expiresAt: addMs(now(), URL_TTL_SECONDS * SECOND).toISOString(),
  };
}

/** Claimable = this property's unlinked, non-removed photo upload made by the caller. */
const claimable = (propertyId: string, avatarId: string, uploaderId: string) => ({
  id: avatarId,
  propertyId,
  entityType: AVATAR_ENTITY,
  entityId: null,
  removedAt: null,
  uploadedById: uploaderId,
});

/**
 * Verifies a photo upload before use (outside the write transaction — it reads
 * storage): owned by the caller, still unlinked, object present with the
 * declared size (≤ 2 MB) and image magic bytes matching the declared type.
 */
export async function prepareAvatar(propertyId: string, avatarId: string, actorId: string): Promise<Fail | null> {
  const row = await prisma.attachment.findFirst({ where: claimable(propertyId, avatarId, actorId) });
  if (!row) return fieldFail("avatarId", UPLOAD_AGAIN);
  if (!isImageMime(row.mime)) return fieldFail("avatarId", BAD_PHOTO);
  const info = await storage().head(row.storageKey);
  if (!info || info.size !== row.sizeBytes || info.size > AVATAR_MAX_BYTES) return fieldFail("avatarId", BAD_PHOTO);
  if (!matchesMime(await storage().readHead(row.storageKey, SNIFF_BYTES), row.mime)) return fieldFail("avatarId", BAD_PHOTO);
  return null;
}

/**
 * Sets (uuid), replaces or removes (null) a user's photo inside the caller's
 * transaction. The previous photo is soft-removed; one audit row per change.
 * Throws `Abort` (422) if the upload was linked or swept since `prepareAvatar`.
 */
export async function setAvatar(tx: Tx, propertyId: string, userId: string, avatarId: string | null, actor: Actor): Promise<void> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { avatarAttachmentId: true } });
  if (!user) throw new Abort(failWith("NOT_FOUND"));
  const previous = user.avatarAttachmentId;
  if (previous === avatarId) return;

  if (avatarId) {
    const { count } = await tx.attachment.updateMany({
      where: claimable(propertyId, avatarId, actor.id),
      data: { entityId: userId, linkedAt: now() },
    });
    if (count !== 1) throw new Abort(fieldFail("avatarId", UPLOAD_AGAIN));
  }
  if (previous) await tx.attachment.update({ where: { id: previous }, data: { removedAt: now(), removedById: actor.id } });
  await tx.user.update({ where: { id: userId }, data: { avatarAttachmentId: avatarId } });
  await audit(tx, {
    actorId: actor.id,
    action: avatarId ? "user.avatar.updated" : "user.avatar.removed",
    entityType: "user",
    entityId: userId,
    before: { attachmentId: previous },
    ...(avatarId ? { after: { attachmentId: avatarId } } : {}),
    ip: actor.ip,
    userAgent: actor.userAgent,
  });
}
