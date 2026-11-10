// Profile photo storage & verification (add-profile-photo D1, D3, D4).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inTransaction } from "@/lib/api/in-transaction";
import { prepareAttachments, sweepUnlinkedUploads, UNLINKED_TTL_MS } from "@/lib/attachments/attachment-service";
import { AVATAR_MAX_BYTES, prepareAvatar, presignAvatarUpload, setAvatar } from "@/lib/attachments/avatar-service";
import { prisma } from "@/lib/prisma";
import { createProperty, createUser } from "../../helpers/factory";
import { fileBytes, useFakeStorage } from "../../helpers/fake-storage";

let store: ReturnType<typeof useFakeStorage>;
beforeEach(() => {
  store = useFakeStorage();
});
afterEach(() => {
  vi.useRealTimers();
  store.reset();
});

async function world() {
  const property = await createProperty();
  const admin = await createUser({ roles: ["SUPER_ADMIN"] });
  const owner = await createUser();
  return { property, admin, owner };
}

type W = Awaited<ReturnType<typeof world>>;

/** Presign + "upload" a photo as `uploaderId`; returns the attachment id. */
async function photo(w: W, uploaderId: string, opts: { kind?: "png" | "pdf" | "exe"; size?: number; stored?: Uint8Array | null } = {}) {
  const size = opts.size ?? 64;
  const r = await presignAvatarUpload(w.property.id, { fileName: "me.png", mime: "image/png", size }, { id: uploaderId });
  if (!r.ok) throw new Error(`presign failed: ${r.code}`);
  const row = await prisma.attachment.findUniqueOrThrow({ where: { id: r.avatarId } });
  if (opts.stored !== null) store.put(row.storageKey, opts.stored ?? fileBytes(opts.kind ?? "png", size));
  return r.avatarId;
}

const set = (w: W, userId: string, avatarId: string | null, actorId: string) =>
  inTransaction(async (tx) => {
    await setAvatar(tx, w.property.id, userId, avatarId, { id: actorId });
    return {};
  });

describe("presignAvatarUpload", () => {
  it("creates an unlinked user_avatar row under the avatar prefix", async () => {
    const w = await world();
    const r = await presignAvatarUpload(w.property.id, { fileName: "me.jpg", mime: "image/jpeg", size: 180000 }, { id: w.owner.id });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.uploadUrl).toContain(`p/${w.property.id}/avatar/`);
    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: r.avatarId } });
    expect(row).toMatchObject({ entityType: "user_avatar", entityId: null, linkedAt: null, uploadedById: w.owner.id, mime: "image/jpeg", sizeBytes: 180000 });
    expect(row.storageKey.startsWith(`p/${w.property.id}/avatar/`)).toBe(true);
  });

  it("refuses photos over 2 MB", async () => {
    const w = await world();
    const r = await presignAvatarUpload(w.property.id, { fileName: "big.jpg", mime: "image/jpeg", size: AVATAR_MAX_BYTES + 1 }, { id: w.owner.id });
    expect(r).toMatchObject({ ok: false, code: "FILE_TOO_LARGE" });
  });
});

describe("prepareAvatar", () => {
  it("accepts the caller's own verified upload", async () => {
    const w = await world();
    const id = await photo(w, w.owner.id);
    expect(await prepareAvatar(w.property.id, id, w.owner.id)).toBeNull();
  });

  it("rejects someone else's upload", async () => {
    const w = await world();
    const id = await photo(w, w.admin.id);
    expect(await prepareAvatar(w.property.id, id, w.owner.id)).toMatchObject({ code: "VALIDATION_FAILED", fields: { avatarId: expect.any(String) } });
  });

  it("rejects a bill upload id", async () => {
    const w = await world();
    const bill = await prisma.attachment.create({
      data: { propertyId: w.property.id, storageKey: `p/${w.property.id}/att/bill-${Date.now()}`, fileName: "bill.png", mime: "image/png", sizeBytes: 64, uploadedById: w.owner.id },
    });
    store.put(bill.storageKey, fileBytes("png"));
    expect(await prepareAvatar(w.property.id, bill.id, w.owner.id)).toMatchObject({ fields: { avatarId: expect.any(String) } });
  });

  it("rejects linked and removed uploads", async () => {
    const w = await world();
    const linked = await photo(w, w.owner.id);
    expect((await set(w, w.owner.id, linked, w.owner.id)).ok).toBe(true);
    expect(await prepareAvatar(w.property.id, linked, w.owner.id)).toMatchObject({ fields: { avatarId: expect.any(String) } });
    const removed = await photo(w, w.owner.id);
    await prisma.attachment.update({ where: { id: removed }, data: { removedAt: new Date() } });
    expect(await prepareAvatar(w.property.id, removed, w.owner.id)).toMatchObject({ fields: { avatarId: expect.any(String) } });
  });

  it("rejects a missing object, a size mismatch and spoofed bytes", async () => {
    const w = await world();
    const missing = await photo(w, w.owner.id, { stored: null });
    expect(await prepareAvatar(w.property.id, missing, w.owner.id)).toMatchObject({ fields: { avatarId: expect.any(String) } });
    const short = await photo(w, w.owner.id, { size: 64, stored: fileBytes("png", 32) });
    expect(await prepareAvatar(w.property.id, short, w.owner.id)).toMatchObject({ fields: { avatarId: expect.any(String) } });
    const pdf = await photo(w, w.owner.id, { kind: "pdf" });
    expect(await prepareAvatar(w.property.id, pdf, w.owner.id)).toMatchObject({ fields: { avatarId: expect.any(String) } });
  });

  it("rejects another property's upload", async () => {
    const w = await world();
    const id = await photo(w, w.owner.id);
    const other = await createProperty();
    expect(await prepareAvatar(other.id, id, w.owner.id)).toMatchObject({ fields: { avatarId: expect.any(String) } });
  });
});

describe("setAvatar", () => {
  const audits = (userId: string) => prisma.auditLog.findMany({ where: { entityType: "user", entityId: userId, action: { startsWith: "user.avatar" } }, orderBy: { createdAt: "asc" } });

  it("links a first photo, sets the pointer and audits", async () => {
    const w = await world();
    const id = await photo(w, w.owner.id);
    expect((await set(w, w.owner.id, id, w.owner.id)).ok).toBe(true);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: w.owner.id } });
    expect(user.avatarAttachmentId).toBe(id);
    const row = await prisma.attachment.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ entityType: "user_avatar", entityId: w.owner.id, linkedAt: expect.any(Date), removedAt: null });
    const log = await audits(w.owner.id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ action: "user.avatar.updated", actorId: w.owner.id, before: { attachmentId: null }, after: { attachmentId: id } });
  });

  it("replaces: soft-removes the previous photo and audits before/after", async () => {
    const w = await world();
    const p1 = await photo(w, w.owner.id);
    await set(w, w.owner.id, p1, w.owner.id);
    const p2 = await photo(w, w.owner.id);
    expect((await set(w, w.owner.id, p2, w.owner.id)).ok).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: w.owner.id } })).avatarAttachmentId).toBe(p2);
    expect(await prisma.attachment.findUniqueOrThrow({ where: { id: p1 } })).toMatchObject({ removedAt: expect.any(Date), removedById: w.owner.id });
    const log = await audits(w.owner.id);
    expect(log[1]).toMatchObject({ action: "user.avatar.updated", before: { attachmentId: p1 }, after: { attachmentId: p2 } });
  });

  it("removes with null and audits user.avatar.removed", async () => {
    const w = await world();
    const p1 = await photo(w, w.owner.id);
    await set(w, w.owner.id, p1, w.owner.id);
    expect((await set(w, w.owner.id, null, w.admin.id)).ok).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: w.owner.id } })).avatarAttachmentId).toBeNull();
    expect(await prisma.attachment.findUniqueOrThrow({ where: { id: p1 } })).toMatchObject({ removedAt: expect.any(Date), removedById: w.admin.id });
    const log = await audits(w.owner.id);
    expect(log[1]).toMatchObject({ action: "user.avatar.removed", actorId: w.admin.id, before: { attachmentId: p1 } });
  });

  it("is a no-op for the same id or removing nothing", async () => {
    const w = await world();
    expect((await set(w, w.owner.id, null, w.owner.id)).ok).toBe(true);
    const p1 = await photo(w, w.owner.id);
    await set(w, w.owner.id, p1, w.owner.id);
    expect((await set(w, w.owner.id, p1, w.owner.id)).ok).toBe(true);
    expect(await audits(w.owner.id)).toHaveLength(1);
  });

  it("aborts with 422 when the upload was claimed meanwhile", async () => {
    const w = await world();
    const id = await photo(w, w.owner.id);
    await prisma.attachment.update({ where: { id }, data: { removedAt: new Date() } }); // swept between prepare and link
    const r = await set(w, w.owner.id, id, w.owner.id);
    expect(r).toMatchObject({ ok: false, code: "VALIDATION_FAILED", fields: { avatarId: expect.any(String) } });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: w.owner.id } })).avatarAttachmentId).toBeNull();
  });
});

describe("bill and photo uploads stay separate", () => {
  it("never accepts a photo upload as a bill attachment", async () => {
    const w = await world();
    const id = await photo(w, w.admin.id);
    const r = await prepareAttachments(w.property.id, [id], 0);
    expect(r).toMatchObject({ ok: false, fields: { attachmentIds: expect.any(String) } });
  });
});

describe("sweepUnlinkedUploads", () => {
  it("also sweeps abandoned photo uploads", async () => {
    const w = await world();
    const id = await photo(w, w.admin.id);
    const row = await prisma.attachment.findUniqueOrThrow({ where: { id } });
    await prisma.attachment.update({ where: { id }, data: { createdAt: new Date(Date.now() - UNLINKED_TTL_MS - 60_000) } });
    expect(await sweepUnlinkedUploads()).toBeGreaterThanOrEqual(1);
    expect((await prisma.attachment.findUniqueOrThrow({ where: { id } })).removedAt).not.toBeNull();
    expect(store.has(row.storageKey)).toBe(false);
  });
});
