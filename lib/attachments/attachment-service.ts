// Bills & receipts (Income & Expenses PRD ATT-01..03). Files live in a
// private bucket; rows are created unlinked at presign time and linked to an
// entry once the upload is verified (exists, size, magic bytes).
import { visibleTo } from "@/lib/accounting/requests";
import { canSee as canSeeComplaint } from "@/lib/complaints/rules";
import { randomUUID } from "node:crypto";
import type { Prisma, Attachment } from "@/lib/generated/prisma/client";
import { Abort, inTransaction as run } from "@/lib/api/in-transaction";
import { failWith, fieldFail, type Actor, type Fail, type Result } from "@/lib/api/result";
import { attachmentFileUrl } from "@/lib/attachments/file-url";
import { audit } from "@/lib/audit";
import { addMs, HOUR, now, SECOND } from "@/lib/clock";
import { matchesMime, SNIFF_BYTES } from "@/lib/files/magic";
import { lockPeriod } from "@/lib/periods/period-service";
import { prisma } from "@/lib/prisma";
import { storage, URL_TTL_SECONDS, type StoredObject } from "@/lib/storage";

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
/** An unlinked bill/receipt upload; profile-photo uploads (`user_avatar`) can never become a bill. */
const BILL_UPLOAD = { entityId: null, removedAt: null, entityType: { not: "user_avatar" } } as const;

export async function attachmentCounts(db: Db, txnIds: string[]): Promise<Map<string, number>> {
  if (!txnIds.length) return new Map();
  const groups = await db.attachment.groupBy({ by: ["entityId"], where: { entityId: { in: txnIds }, ...LINKED }, _count: { _all: true } });
  return new Map(groups.map((g) => [g.entityId!, g._count._all]));
}

/** Linked files of many entities at once (statement rows). */
export async function attachmentsFor(db: Db, entityIds: string[]): Promise<Map<string, AttachmentDto[]>> {
  const map = new Map<string, AttachmentDto[]>();
  if (!entityIds.length) return map;
  const rows = await db.attachment.findMany({ where: { entityId: { in: entityIds }, ...LINKED }, orderBy: { linkedAt: "asc" } });
  for (const r of rows) map.set(r.entityId!, [...(map.get(r.entityId!) ?? []), toDto(r)]);
  return map;
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
  const rows = await prisma.attachment.findMany({ where: { id: { in: unique }, propertyId, ...BILL_UPLOAD } });
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
export type AttachmentEntity = "house_transaction" | "owner_ledger_entry" | "loan" | "money_request" | "notice" | "complaint" | "complaint_comment";

export async function linkAttachments(
  tx: Tx,
  propertyId: string,
  txnId: string,
  rows: Attachment[],
  actor: Actor,
  entityType: AttachmentEntity = "house_transaction",
): Promise<void> {
  for (const row of rows) {
    const { count } = await tx.attachment.updateMany({
      where: { id: row.id, propertyId, ...BILL_UPLOAD },
      data: { entityType, entityId: txnId, linkedAt: now() },
    });
    if (count !== 1) throw new Abort(fieldFail("attachmentIds", UPLOAD_AGAIN));
    await audit(tx, {
      actorId: actor.id,
      action: "attachment.added",
      entityType,
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

/** `If-None-Match` holds the ETag (weak or strong, or `*`)? */
function etagMatches(ifNoneMatch: string, etag: string) {
  const bare = (t: string) => t.trim().replace(/^W\//, "");
  return ifNoneMatch.split(",").some((t) => t.trim() === "*" || bare(t) === bare(etag));
}

/** Who opens a file: request files follow the request's visibility (Requests F15, Rule 12). */
/** `viewAll` = `request.view.all`; `complaintViewAll` = `complaint.view.all`. */
export type FileViewer = { userId: string; viewAll: boolean; complaintViewAll?: boolean };

/**
 * Bills, receipts and loan files are visible to everyone with `attachment.view`;
 * a money request's files only to its requester and the Super Admin — and,
 * once paid out, to every owner unless the requester marked the file Private.
 */
async function mayView(att: { entityType: string; entityId: string | null; isPrivate: boolean }, viewer: FileViewer): Promise<boolean> {
  // Complaint and comment files follow the complaint's visibility; hidden comments hide their files (Rule 17, G13).
  if (att.entityType === "complaint" || att.entityType === "complaint_comment") {
    const where =
      att.entityType === "complaint" ? { id: att.entityId! } : { comments: { some: { id: att.entityId!, hiddenAt: null } } };
    const c = await prisma.complaint.findFirst({ where, select: { visibility: true, createdById: true } });
    return !!c && canSeeComplaint(c, { userId: viewer.userId, viewAll: viewer.complaintViewAll ?? false });
  }
  if (att.entityType !== "money_request") return true;
  const r = await prisma.moneyRequest.findUnique({ where: { id: att.entityId! }, select: { status: true, createdById: true, owner: { select: { userId: true } } } });
  if (!r) return false;
  const v = visibleTo({ status: r.status, ownerUserId: r.owner.userId, createdById: r.createdById }, viewer);
  return v === "full" || (v === "limited" && !att.isPrivate);
}

export type OpenedFile =
  | { notModified: true; etag: string }
  | ({ notModified: false; mime: string; fileName: string } & StoredObject);

/**
 * ATT-02: a linked, non-removed file of this property, streamed from the
 * private bucket for the same-origin proxy. Null when the row or the stored
 * object doesn't exist. A matching `If-None-Match` is answered from a HEAD,
 * so an unchanged file is never downloaded from storage again.
 */
export async function openFile(propertyId: string, id: string, viewer: FileViewer, opts: { ifNoneMatch?: string | null } = {}): Promise<OpenedFile | null> {
  const att = await prisma.attachment.findFirst({ where: { id, propertyId, ...LINKED } });
  if (!att || !(await mayView(att, viewer))) return null;
  if (opts.ifNoneMatch) {
    const info = await storage().head(att.storageKey);
    if (!info) return null;
    if (info.etag && etagMatches(opts.ifNoneMatch, info.etag)) return { notModified: true, etag: info.etag };
  }
  const obj = await storage().get(att.storageKey);
  if (!obj) return null;
  return { notModified: false, mime: att.mime, fileName: att.fileName, ...obj };
}

/** ATT-02: what a client needs to show a linked, non-removed file of this property. */
export async function fileMeta(propertyId: string, id: string, viewer: FileViewer) {
  const att = await prisma.attachment.findFirst({ where: { id, propertyId, ...LINKED }, select: { id: true, mime: true, fileName: true, entityType: true, entityId: true, isPrivate: true } });
  if (!att || !(await mayView(att, viewer))) return null;
  return { url: attachmentFileUrl(att.id), mime: att.mime, fileName: att.fileName };
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
