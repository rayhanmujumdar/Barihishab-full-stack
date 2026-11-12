// Comments (Notices & Complaints PRD C7, G8, G13, Rule 12): anyone who can see
// a live complaint may comment (≤ 3 files); the author may edit within 15
// minutes; nobody deletes; the Super Admin may hide one with a visible reason.
import { Abort, inTransaction } from "@/lib/api/in-transaction";
import { failWith, type Result } from "@/lib/api/result";
import { linkAttachments } from "@/lib/attachments/attachment-service";
import { audit } from "@/lib/audit";
import { now } from "@/lib/clock";
import type { ComplaintDetailDto } from "./complaint-read";
import { complaintDetail } from "./complaint-read";
import { lockVisible, uploads, type ComplaintActor } from "./complaint-service";
import { canEditComment, isLive } from "./rules";

export const MAX_COMMENT_FILES = 3;

const viewerOf = (a: ComplaintActor) => ({ userId: a.id, viewAll: a.viewAll, requestViewAll: a.requestViewAll, decide: a.decide, locale: a.locale });

export async function addComment(propertyId: string, id: string, input: { body: string; attachmentIds?: string[] }, actor: ComplaintActor): Promise<Result<{ complaint: ComplaintDetailDto }>> {
  const files = await uploads(propertyId, input.attachmentIds, 0, actor);
  if (!Array.isArray(files)) return files;
  if (files.length > MAX_COMMENT_FILES) return failWith("TOO_MANY_ATTACHMENTS");
  return inTransaction(async (tx) => {
    const row = await lockVisible(tx, propertyId, id, actor);
    if (!isLive(row.status)) throw new Abort(failWith("COMPLAINT_CLOSED"));
    const c = await tx.complaintComment.create({ data: { complaintId: id, authorId: actor.id, body: input.body, createdAt: now() } });
    await linkAttachments(tx, propertyId, c.id, files, actor, "complaint_comment");
    await audit(tx, { actorId: actor.id, action: "complaint.comment_added", entityType: "complaint", entityId: id, after: { commentId: c.id }, ip: actor.ip, userAgent: actor.userAgent });
    // Writing counts as having seen the thread up to now.
    await tx.complaintView.upsert({ where: { complaintId_userId: { complaintId: id, userId: actor.id } }, create: { complaintId: id, userId: actor.id, seenAt: now() }, update: { seenAt: now() } });
    return { complaint: (await complaintDetail(tx, propertyId, id, viewerOf(actor)))! };
  });
}

async function lockComment(tx: Parameters<Parameters<typeof inTransaction>[0]>[0], propertyId: string, id: string, commentId: string, actor: ComplaintActor) {
  const row = await lockVisible(tx, propertyId, id, actor);
  const c = await tx.complaintComment.findFirst({ where: { id: commentId, complaintId: id } });
  if (!c) throw new Abort(failWith("NOT_FOUND"));
  return { row, c };
}

export async function editComment(propertyId: string, id: string, commentId: string, body: string, actor: ComplaintActor): Promise<Result<{ complaint: ComplaintDetailDto }>> {
  return inTransaction(async (tx) => {
    const { row, c } = await lockComment(tx, propertyId, id, commentId, actor);
    const refusal = canEditComment(c, actor.id, now());
    if (refusal) throw new Abort(failWith(refusal));
    if (!isLive(row.status)) throw new Abort(failWith("COMPLAINT_CLOSED"));
    await tx.complaintComment.update({ where: { id: commentId }, data: { body, editedAt: now() } });
    await audit(tx, { actorId: actor.id, action: "complaint.comment_edited", entityType: "complaint", entityId: id, before: { commentId, body: c.body }, after: { commentId, body }, ip: actor.ip, userAgent: actor.userAgent });
    return { complaint: (await complaintDetail(tx, propertyId, id, viewerOf(actor)))! };
  });
}

/** G13: "Hidden by Admin: {reason}" for everyone; the original stays in the audit log. */
export async function hideComment(propertyId: string, id: string, commentId: string, reason: string, actor: ComplaintActor): Promise<Result<{ complaint: ComplaintDetailDto }>> {
  return inTransaction(async (tx) => {
    const { c } = await lockComment(tx, propertyId, id, commentId, actor);
    if (c.hiddenAt) throw new Abort(failWith("INVALID_COMPLAINT_STATUS"));
    await tx.complaintComment.update({ where: { id: commentId }, data: { hiddenAt: now(), hiddenById: actor.id, hiddenReason: reason } });
    await audit(tx, { actorId: actor.id, action: "complaint.comment_hidden", entityType: "complaint", entityId: id, before: { commentId, body: c.body }, reason, ip: actor.ip, userAgent: actor.userAgent });
    return { complaint: (await complaintDetail(tx, propertyId, id, viewerOf(actor)))! };
  });
}
