// Bills & receipts (Income & Expenses PRD ATT-01..03). Files live in a
// private bucket; rows are created unlinked at presign time and linked to an
// entry once the upload is verified (exists, size, magic bytes).
import { randomUUID } from "node:crypto";
import type { Prisma, Attachment } from "@/lib/generated/prisma/client";
import { Abort, inTransaction as run } from "@/lib/api/in-transaction";
import { failWith, fieldFail, type Actor, type Fail, type Result } from "@/lib/api/result";
import { audit } from "@/lib/audit";
import { addMs, HOUR, now, SECOND } from "@/lib/clock";
import { matchesMime, SNIFF_BYTES } from "@/lib/files/magic";
import { lockPeriod } from "@/lib/periods/period-service";
import { prisma } from "@/lib/prisma";
import { storage, URL_TTL_SECONDS } from "@/lib/storage";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export const MAX_FILES = 5;
export const MAX_BYTES = 5 * 1024 * 1024;
export const BAD_FILE = "Only JPG, PNG, WebP or PDF up to 5 MB.";
const UPLOAD_AGAIN = "Upload the file again.";
/** Uploads never linked to an entry within this long are swept (see sweepUnlinkedUploads). */
export const UNLINKED_TTL_MS = 24 * HOUR;

export type AttachmentDto = { id: string; fileName: string; mime: string; sizeBytes: number };
const toDto = (a: Attachment): AttachmentDto => ({ id: a.id, fileName: a.fileName, mime: a.mime, sizeBytes: a.sizeBytes });

const LINKED = { removedAt: null, linkedAt: { not: null } } as const;

export async function attachmentCounts(db: Db, txnIds: string[]): Promise<Map<string, number>> {
  if (!txnIds.length) return new Map();
  const groups = await db.attachment.groupBy({ by: ["entityId"], where: { entityId: { in: txnIds }, ...LINKED }, _count: { _all: true } });
  return new Map(groups.map((g) => [g.entityId!, g._count._all]));
}

export async function listAttachments(db: Db, txnId: string): Promise<AttachmentDto[]> {
  const rows = await db.attachment.findMany({ where: { entityId: txnId, ...LINKED }, orderBy: { linkedAt: "asc" } });
  return rows.map(toDto);
}

// ─── Upload ───

export async function presignUpload(propertyId: string, input: { fileName: string; mime: string; size: number }, actor: Actor) {
  if (input.size > MAX_BYTES) return failWith("FILE_TOO_LARGE");
  const storageKey = `p/${propertyId}/att/${randomUUID()}`;
  const uploadUrl = await storage().presignPut(storageKey, input.mime, input.size);
  const row = await prisma.attachment.create({
    data: { propertyId, storageKey, fileName: input.fileName, mime: input.mime, sizeBytes: input.size, uploadedById: actor.id },
  });
  return {
    ok: true as const,
    attachmentId: row.id,
    uploadUrl,
    headers: { "Content-Type": input.mime },
    expiresAt: addMs(now(), URL_TTL_SECONDS * SECOND).toISOString(),
  };
}

/**
 * Verifies unlinked uploads before linking: ≤ 5 per entry, the object exists
 * with the declared size, and its leading bytes match the declared type (IE-20).
 */
export async function prepareAttachments(propertyId: string, ids: string[], existing: number): Promise<Attachment[] | Fail> {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  if (existing + unique.length > MAX_FILES) return failWith("TOO_MANY_ATTACHMENTS");
  const rows = await prisma.attachment.findMany({ where: { id: { in: unique }, propertyId, entityId: null, removedAt: null } });
  if (rows.length !== unique.length) return fieldFail("attachmentIds", UPLOAD_AGAIN);
  for (const row of rows) {
    const info = await storage().head(row.storageKey);
    if (!info || info.size !== row.sizeBytes || info.size > MAX_BYTES) return fieldFail("attachmentIds", BAD_FILE);
    if (!matchesMime(await storage().readHead(row.storageKey, SNIFF_BYTES), row.mime)) return fieldFail("attachmentIds", BAD_FILE);
  }
  return rows;
}

/**
 * Links verified uploads to an entry inside the caller's transaction (one audit row each).
 * Must run inside `inTransaction`: an upload linked or swept meanwhile aborts with a 422.
 */
export async function linkAttachments(tx: Tx, propertyId: string, txnId: string, rows: Attachment[], actor: Actor): Promise<void> {
  for (const row of rows) {
    const { count } = await tx.attachment.updateMany({
      where: { id: row.id, propertyId, entityId: null, removedAt: null },
      data: { entityId: txnId, linkedAt: now() },
    });
    if (count !== 1) throw new Abort(fieldFail("attachmentIds", UPLOAD_AGAIN));
    await audit(tx, {
      actorId: actor.id,
      action: "attachment.added",
      entityType: "house_transaction",
      entityId: txnId,
      after: { attachmentId: row.id, fileName: row.fileName },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
  }
}

/** Guards an entry for attachment changes: exists, not voided, period Open (locked). */
async function lockEntry(tx: Tx, propertyId: string, txnId: string): Promise<Fail | null> {
  const txn = await tx.houseTransaction.findFirst({ where: { id: txnId, propertyId } });
  if (!txn) return failWith("NOT_FOUND");
  const period = await lockPeriod(tx, txn.periodId);
  if (period?.status !== "OPEN") return failWith("PERIOD_CLOSED");
  if (txn.voidedAt) return failWith("ALREADY_VOIDED");
  return null;
}

/** ATT-03: add files to a saved entry in an Open month. */
export async function addAttachments(propertyId: string, txnId: string, ids: string[], actor: Actor): Promise<Result<{ attachments: AttachmentDto[] }>> {
  const pre = await prisma.$transaction((tx) => lockEntry(tx, propertyId, txnId));
  if (pre) return pre;
  const existing = (await attachmentCounts(prisma, [txnId])).get(txnId) ?? 0;
  const rows = await prepareAttachments(propertyId, ids, existing);
  if (!Array.isArray(rows)) return rows;
  return run(async (tx) => {
    const fail = await lockEntry(tx, propertyId, txnId);
    if (fail) throw new Abort(fail);
    if (((await attachmentCounts(tx, [txnId])).get(txnId) ?? 0) + rows.length > MAX_FILES) throw new Abort(failWith("TOO_MANY_ATTACHMENTS"));
    await linkAttachments(tx, propertyId, txnId, rows, actor);
    return { attachments: await listAttachments(tx, txnId) };
  });
}

/** ATT-02: soft-remove (the object stays in the bucket; files are never replaced). */
export async function removeAttachment(propertyId: string, txnId: string, attId: string, actor: Actor): Promise<Result<object>> {
  return run(async (tx) => {
    const fail = await lockEntry(tx, propertyId, txnId);
    if (fail) throw new Abort(fail);
    const att = await tx.attachment.findFirst({ where: { id: attId, propertyId, entityId: txnId, removedAt: null } });
    if (!att) throw new Abort(failWith("NOT_FOUND"));
    await tx.attachment.update({ where: { id: attId }, data: { removedAt: now(), removedById: actor.id } });
    await audit(tx, {
      actorId: actor.id,
      action: "attachment.removed",
      entityType: "house_transaction",
      entityId: txnId,
      before: { attachmentId: att.id, fileName: att.fileName },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return {};
  });
}

/** ATT-02: 5-minute signed view URL for a linked, non-removed file. */
export async function viewUrl(propertyId: string, id: string) {
  const att = await prisma.attachment.findFirst({ where: { id, propertyId, ...LINKED } });
  if (!att) return null;
  return {
    url: await storage().presignGet(att.storageKey, att.fileName, att.mime),
    mime: att.mime,
    fileName: att.fileName,
    expiresAt: addMs(now(), URL_TTL_SECONDS * SECOND).toISOString(),
  };
}

// ─── Housekeeping ───

/**
 * Uploads presigned but never linked (form abandoned, upload failed) are
 * soft-removed and their objects deleted once older than UNLINKED_TTL_MS.
 * Rows are never deleted (no-delete trigger); the claim runs first so a
 * concurrent link can't pick up a file that is about to vanish.
 */
export async function sweepUnlinkedUploads(maxAgeMs = UNLINKED_TTL_MS, batch = 500): Promise<number> {
  const stale = await prisma.attachment.findMany({
    where: { entityId: null, removedAt: null, createdAt: { lt: addMs(now(), -maxAgeMs) } },
    select: { id: true, storageKey: true },
    orderBy: { createdAt: "asc" },
    take: batch,
  });
  let swept = 0;
  for (const row of stale) {
    const { count } = await prisma.attachment.updateMany({ where: { id: row.id, entityId: null, removedAt: null }, data: { removedAt: now() } });
    if (count !== 1) continue; // linked meanwhile
    await storage().delete(row.storageKey);
    swept += 1;
  }
  return swept;
}
