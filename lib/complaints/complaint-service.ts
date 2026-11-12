// Complaint writes (Notices & Complaints PRD C2, C4–C7, Rules 7–13; design
// D7, D14). Each write: lock the row, re-check the lifecycle, then change +
// audit + outbox in one transaction. Invisible complaints answer 404.
import { Abort, inTransaction } from "@/lib/api/in-transaction";
import { failWith, fieldFail, type Actor, type Result } from "@/lib/api/result";
import { linkAttachments, prepareAttachments } from "@/lib/attachments/attachment-service";
import { audit } from "@/lib/audit";
import { now } from "@/lib/clock";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { Locale } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { displayName } from "@/lib/users/dto";
import { complaintDetail, findVisible, type ComplaintDetailDto } from "./complaint-read";
import { validateLink, type LinkRef } from "./links";
import { notifyComplaint, type MailComplaint } from "./notify";
import { canPublish, canReopen, nextStatus, type ComplaintAction } from "./rules";

type Tx = Prisma.TransactionClient;

/** The caller with the complaint permissions resolved once per request. */
export type ComplaintActor = Actor & { viewAll: boolean; decide: boolean; requestViewAll: boolean; locale: Locale };

export type RaiseInput = { title: string; body: string; visibility: "ALL" | "ADMIN"; link?: LinkRef | null; attachmentIds?: string[] };
export type StatusInput = { status: "IN_REVIEW" | "RESOLVED" | "REJECTED"; explanation?: string | null; fix?: LinkRef | null };

export const EXPLAIN_FIRST = "Write the explanation first — the complainant receives it.";
export const SAY_WHY = "Say why it isn't resolved.";
const LINK_MSG = "Pick something you can see, or “Nothing specific”.";
const UPLOAD_AGAIN = "Upload the file again.";

const viewerOf = (a: ComplaintActor) => ({ userId: a.id, viewAll: a.viewAll, requestViewAll: a.requestViewAll, decide: a.decide, locale: a.locale });
const meta = (a: Actor, id: string) => ({ actorId: a.id, entityType: "complaint", entityId: id, ip: a.ip, userAgent: a.userAgent });

async function nameOf(tx: Tx, id: string): Promise<string> {
  return displayName(await tx.user.findUniqueOrThrow({ where: { id }, select: { firstName: true, lastName: true, name: true, username: true } }));
}

/** Verified uploads this actor may link (non-admins only their own). */
export async function uploads(propertyId: string, ids: string[] | undefined, existing: number, actor: ComplaintActor): Promise<Awaited<ReturnType<typeof prepareAttachments>>> {
  const rows = await prepareAttachments(propertyId, ids ?? [], existing);
  if (Array.isArray(rows) && !actor.viewAll && rows.some((r) => r.uploadedById !== actor.id)) return fieldFail("attachmentIds", UPLOAD_AGAIN);
  return rows;
}

/** Locks a visible complaint row for this transaction (or aborts with 404). */
export async function lockVisible(tx: Tx, propertyId: string, id: string, actor: ComplaintActor) {
  await tx.$queryRaw`SELECT id FROM complaints WHERE id = ${id}::uuid FOR UPDATE`;
  const row = await findVisible(tx, propertyId, id, actor.viewAll ? { userId: actor.id, viewAll: true } : { userId: actor.id, viewAll: false });
  if (!row) throw new Abort(failWith("NOT_FOUND"));
  return row;
}

async function mail(tx: Tx, row: { id: string; propertyId: string; title: string; visibility: "ALL" | "ADMIN"; aboutAdmin: boolean; createdById: string }): Promise<MailComplaint> {
  return { ...row, complainantName: await nameOf(tx, row.createdById) };
}

async function detail(tx: Tx, propertyId: string, id: string, actor: ComplaintActor): Promise<{ complaint: ComplaintDetailDto }> {
  return { complaint: (await complaintDetail(tx, propertyId, id, viewerOf(actor)))! };
}

/** C2: raise a complaint (Everyone → members emailed, Admin only → Super Admin). */
export async function raiseComplaint(propertyId: string, input: RaiseInput, actor: ComplaintActor): Promise<Result<{ complaint: ComplaintDetailDto }>> {
  const link = input.link ? await validateLink(prisma, propertyId, input.link, { userId: actor.id, requestViewAll: actor.requestViewAll }) : null;
  if (input.link && !link) return fieldFail("link", LINK_MSG);
  const files = await uploads(propertyId, input.attachmentIds, 0, actor);
  if (!Array.isArray(files)) return files;
  return inTransaction(async (tx) => {
    const c = await tx.complaint.create({
      data: {
        propertyId,
        title: input.title,
        body: input.body,
        visibility: input.visibility,
        linkType: link?.type ?? null,
        linkId: link?.id ?? null,
        periodId: link?.periodId ?? null,
        aboutAdmin: link?.aboutAdmin ?? false,
        createdById: actor.id,
        createdAt: now(),
      },
    });
    await linkAttachments(tx, propertyId, c.id, files, actor, "complaint");
    await audit(tx, { ...meta(actor, c.id), action: "complaint.raised", after: { title: c.title, visibility: c.visibility, link: input.link ?? null } });
    await notifyComplaint(tx, await mail(tx, c), c.visibility === "ALL" ? "NEW" : "NEW_PRIVATE", { actorId: actor.id, actorName: await nameOf(tx, actor.id), stamp: "" });
    return detail(tx, propertyId, c.id, actor);
  });
}

const ACTION: Record<StatusInput["status"], ComplaintAction> = { IN_REVIEW: "IN_REVIEW", RESOLVED: "RESOLVE", REJECTED: "REJECT" };

/** C4: In review (optional note) / Resolve / Reject (explanation required). */
export async function setComplaintStatus(propertyId: string, id: string, input: StatusInput, actor: ComplaintActor): Promise<Result<{ complaint: ComplaintDetailDto }>> {
  const explanation = input.explanation?.trim() || null;
  const closing = input.status !== "IN_REVIEW";
  if (closing && !explanation) return fieldFail("explanation", EXPLAIN_FIRST);
  const fix = closing && input.status === "RESOLVED" && input.fix ? await validateLink(prisma, propertyId, input.fix, { userId: actor.id, requestViewAll: actor.requestViewAll }) : null;
  if (input.fix && input.status === "RESOLVED" && !fix) return fieldFail("fix", LINK_MSG);
  return inTransaction(async (tx) => {
    const row = await lockVisible(tx, propertyId, id, actor);
    const next = nextStatus(row.status, ACTION[input.status]);
    if (!next) throw new Abort(failWith("INVALID_COMPLAINT_STATUS"));
    const at = now();
    const updated = await tx.complaint.update({
      where: { id },
      data: closing
        ? { status: next, closedAt: at, resolutionNote: explanation, resolvedById: actor.id, resolvedAt: at, fixType: fix?.type ?? null, fixId: fix?.id ?? null }
        : { status: next },
    });
    await audit(tx, { ...meta(actor, id), action: "complaint.status_changed", before: { status: row.status }, after: { status: next, fix: fix ? { type: fix.type, id: fix.id } : null }, reason: explanation });
    await notifyComplaint(tx, await mail(tx, updated), input.status, { actorId: actor.id, actorName: await nameOf(tx, actor.id), explanation, stamp: at.toISOString() });
    return detail(tx, propertyId, id, actor);
  });
}

/** C5: the complainant takes back a live complaint (final). */
export async function withdrawComplaint(propertyId: string, id: string, actor: ComplaintActor): Promise<Result<{ complaint: ComplaintDetailDto }>> {
  return inTransaction(async (tx) => {
    const row = await lockVisible(tx, propertyId, id, actor);
    if (row.createdById !== actor.id) throw new Abort(failWith("FORBIDDEN"));
    const next = nextStatus(row.status, "WITHDRAW");
    if (!next) throw new Abort(failWith("INVALID_COMPLAINT_STATUS"));
    const at = now();
    const updated = await tx.complaint.update({ where: { id }, data: { status: next, closedAt: at } });
    await audit(tx, { ...meta(actor, id), action: "complaint.withdrawn", before: { status: row.status }, after: { status: next } });
    await notifyComplaint(tx, await mail(tx, updated), "WITHDRAWN", { actorId: actor.id, actorName: await nameOf(tx, actor.id), stamp: at.toISOString() });
    return detail(tx, propertyId, id, actor);
  });
}

/** C6: once, within 14 days of Resolved/Rejected, with a comment. */
export async function reopenComplaint(propertyId: string, id: string, comment: string, actor: ComplaintActor): Promise<Result<{ complaint: ComplaintDetailDto }>> {
  const text = comment.trim();
  if (!text) return fieldFail("comment", SAY_WHY);
  return inTransaction(async (tx) => {
    const row = await lockVisible(tx, propertyId, id, actor);
    if (row.createdById !== actor.id) throw new Abort(failWith("FORBIDDEN"));
    const at = now();
    const refusal = canReopen(row, at);
    if (refusal) throw new Abort(failWith(refusal));
    const updated = await tx.complaint.update({
      where: { id },
      data: { status: "OPEN", reopened: true, closedAt: null, resolutionNote: null, resolvedById: null, resolvedAt: null, fixType: null, fixId: null },
    });
    await audit(tx, { ...meta(actor, id), action: "complaint.reopened", before: { status: row.status }, after: { status: "OPEN" }, reason: text });
    await tx.complaintComment.create({ data: { complaintId: id, authorId: actor.id, body: text, createdAt: at } });
    await notifyComplaint(tx, await mail(tx, updated), "REOPENED", { actorId: actor.id, actorName: await nameOf(tx, actor.id), explanation: text, stamp: at.toISOString() });
    return detail(tx, propertyId, id, actor);
  });
}

/** G15: Admin only → Everyone, by the complainant; never back. */
export async function publishComplaint(propertyId: string, id: string, actor: ComplaintActor): Promise<Result<{ complaint: ComplaintDetailDto }>> {
  return inTransaction(async (tx) => {
    const row = await lockVisible(tx, propertyId, id, actor);
    const refusal = canPublish(row, actor.id);
    if (refusal) throw new Abort(failWith(refusal));
    const updated = await tx.complaint.update({ where: { id }, data: { visibility: "ALL" } });
    await audit(tx, { ...meta(actor, id), action: "complaint.published", before: { visibility: "ADMIN" }, after: { visibility: "ALL" } });
    // The Super Admin already had the private-complaint email when it was raised.
    await notifyComplaint(tx, await mail(tx, updated), "NEW", { actorId: actor.id, actorName: await nameOf(tx, actor.id), stamp: `public:${now().toISOString()}`, skipAdmins: true });
    return detail(tx, propertyId, id, actor);
  });
}

