// Notice writes (Notices & Complaints PRD N2–N4, Rules 1–6; design D1, D5).
// Every write: one transaction with the change, its audit row and outbox rows.
import { Abort, inTransaction } from "@/lib/api/in-transaction";
import { failWith, fieldFail, type Actor, type Result } from "@/lib/api/result";
import { linkAttachments, MAX_FILES, prepareAttachments } from "@/lib/attachments/attachment-service";
import { audit } from "@/lib/audit";
import { now, todayIsoInDhaka } from "@/lib/clock";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { activeMembers } from "@/lib/users/members";
import { displayName } from "@/lib/users/dto";
import { isoDate, noticeDto, unreadNoticeCount, type NoticeDto } from "./notice-read";
import { noticeAudience, queueNoticeEmails } from "./notify";
import { canRemind } from "./rules";

type Tx = Prisma.TransactionClient;

export type NoticeInput = { title: string; body: string; priority: "NORMAL" | "URGENT"; pinned: boolean; pinUntil?: string | null; attachmentIds?: string[] };
export type NoticeEdit = Partial<Omit<NoticeInput, "attachmentIds">> & { attachmentIds?: string[]; removeAttachmentIds?: string[]; emailChange?: boolean };

const PIN_UNTIL_MSG = "Pick today or a later date.";
const dateOf = (iso: string) => new Date(`${iso}T00:00:00Z`);

async function actorName(tx: Tx, id: string): Promise<string> {
  return displayName(await tx.user.findUniqueOrThrow({ where: { id }, select: { firstName: true, lastName: true, name: true, username: true } }));
}

async function lockNotice(tx: Tx, propertyId: string, id: string) {
  await tx.$queryRaw`SELECT id FROM notices WHERE id = ${id}::uuid FOR UPDATE`;
  const n = await tx.notice.findFirst({ where: { id, propertyId } });
  if (!n) throw new Abort(failWith("NOT_FOUND"));
  if (n.archivedAt) throw new Abort(failWith("NOTICE_ARCHIVED"));
  return n;
}

const live = (propertyId: string, id: string) => ({ entityType: "notice", entityId: id, propertyId, removedAt: null }) as const;

/** N2: publish, record the author's read, email active members. */
export async function publishNotice(propertyId: string, input: NoticeInput, actor: Actor): Promise<Result<{ notice: NoticeDto; emailed: number }>> {
  if (input.pinUntil && input.pinUntil < todayIsoInDhaka()) return fieldFail("pinUntil", PIN_UNTIL_MSG);
  const files = await prepareAttachments(propertyId, input.attachmentIds ?? [], 0);
  if (!Array.isArray(files)) return files;
  return inTransaction(async (tx) => {
    const n = await tx.notice.create({
      data: {
        propertyId,
        title: input.title,
        body: input.body,
        priority: input.priority,
        pinned: input.pinned,
        pinUntil: input.pinned && input.pinUntil ? dateOf(input.pinUntil) : null,
        publishedAt: now(),
        createdById: actor.id,
      },
    });
    await linkAttachments(tx, propertyId, n.id, files, actor, "notice");
    await tx.noticeRead.create({ data: { noticeId: n.id, userId: actor.id, readAt: now() } });
    await audit(tx, { actorId: actor.id, action: "notice.published", entityType: "notice", entityId: n.id, after: { title: n.title, priority: n.priority, pinned: n.pinned, pinUntil: isoDate(n.pinUntil) }, ip: actor.ip, userAgent: actor.userAgent });
    const members = await activeMembers(tx, propertyId);
    const emailed = await queueNoticeEmails(tx, n, "PUBLISHED", noticeAudience(members, n.priority === "URGENT"), { authorName: await actorName(tx, actor.id), stamp: "" });
    return { notice: (await noticeDto(tx, propertyId, n.id, actor.id))!, emailed };
  });
}

/** N3: edit content (shows "Edited"), pin/unpin, Pin until; optionally email the change. */
export async function editNotice(propertyId: string, id: string, input: NoticeEdit, actor: Actor): Promise<Result<{ notice: NoticeDto; emailed: number }>> {
  const today = todayIsoInDhaka();
  if (input.pinUntil && input.pinUntil < today) return fieldFail("pinUntil", PIN_UNTIL_MSG);
  const existing = await prisma.notice.findFirst({ where: { id, propertyId } });
  if (!existing) return failWith("NOT_FOUND");
  if (existing.archivedAt) return failWith("NOTICE_ARCHIVED");
  const removing = new Set(input.removeAttachmentIds ?? []);
  const kept = await prisma.attachment.count({ where: { ...live(propertyId, id), id: { notIn: [...removing] } } });
  const files = await prepareAttachments(propertyId, input.attachmentIds ?? [], kept);
  if (!Array.isArray(files)) return files;
  return inTransaction(async (tx) => {
    const before = await lockNotice(tx, propertyId, id);
    const content = (["title", "body", "priority"] as const).some((k) => input[k] !== undefined && input[k] !== before[k]) || files.length > 0 || removing.size > 0;
    const pinned = input.pinned ?? before.pinned;
    // Re-pinning a notice whose Pin until has passed starts a fresh, open-ended pin.
    let pinUntil = input.pinUntil === undefined ? isoDate(before.pinUntil) : input.pinUntil;
    if (input.pinned && input.pinUntil === undefined && pinUntil && pinUntil < today) pinUntil = null;
    if (!pinned) pinUntil = null;
    const n = await tx.notice.update({
      where: { id },
      data: {
        title: input.title ?? before.title,
        body: input.body ?? before.body,
        priority: input.priority ?? before.priority,
        pinned,
        pinUntil: pinUntil ? dateOf(pinUntil) : null,
        ...(content ? { editedAt: now() } : {}),
      },
    });
    for (const attId of removing) {
      const { count } = await tx.attachment.updateMany({ where: { ...live(propertyId, id), id: attId }, data: { removedAt: now(), removedById: actor.id } });
      if (count !== 1) throw new Abort(fieldFail("removeAttachmentIds", "That file is no longer on this notice."));
      await audit(tx, { actorId: actor.id, action: "attachment.removed", entityType: "notice", entityId: id, before: { attachmentId: attId }, ip: actor.ip, userAgent: actor.userAgent });
    }
    if ((await tx.attachment.count({ where: live(propertyId, id) })) + files.length > MAX_FILES) throw new Abort(failWith("TOO_MANY_ATTACHMENTS"));
    await linkAttachments(tx, propertyId, id, files, actor, "notice");
    const snap = (x: typeof before) => ({ title: x.title, body: x.body, priority: x.priority, pinned: x.pinned, pinUntil: isoDate(x.pinUntil) });
    const meta = { actorId: actor.id, entityType: "notice", entityId: id, ip: actor.ip, userAgent: actor.userAgent };
    if (pinned !== before.pinned) await audit(tx, { ...meta, action: pinned ? "notice.pinned" : "notice.unpinned", before: snap(before), after: snap(n) });
    if (content || (pinned === before.pinned && isoDate(n.pinUntil) !== isoDate(before.pinUntil))) await audit(tx, { ...meta, action: "notice.edited", before: snap(before), after: snap(n) });
    let emailed = 0;
    if (input.emailChange) {
      const members = await activeMembers(tx, propertyId);
      emailed = await queueNoticeEmails(tx, n, "EDITED", noticeAudience(members, n.priority === "URGENT"), { authorName: await actorName(tx, actor.id), stamp: (n.editedAt ?? now()).toISOString() });
    }
    return { notice: (await noticeDto(tx, propertyId, id, actor.id))!, emailed };
  });
}

/** N3: hide from the list and Home; never deleted. */
export async function archiveNotice(propertyId: string, id: string, actor: Actor): Promise<Result<{ notice: NoticeDto }>> {
  return inTransaction(async (tx) => {
    await lockNotice(tx, propertyId, id);
    await tx.notice.update({ where: { id }, data: { archivedAt: now(), archivedById: actor.id } });
    await audit(tx, { actorId: actor.id, action: "notice.archived", entityType: "notice", entityId: id, ip: actor.ip, userAgent: actor.userAgent });
    return { notice: (await noticeDto(tx, propertyId, id, actor.id))! };
  });
}

/** N4 / Rule 4: idempotent; the first read time is kept. */
export async function markRead(propertyId: string, id: string, userId: string): Promise<Result<{ unread: number }>> {
  const n = await prisma.notice.findFirst({ where: { id, propertyId }, select: { id: true } });
  if (!n) return failWith("NOT_FOUND");
  await prisma.noticeRead.createMany({ data: [{ noticeId: id, userId, readAt: now() }], skipDuplicates: true });
  return { ok: true, unread: await unreadNoticeCount(propertyId, userId) };
}

/** G5: Mark all as read (live notices). */
export async function markAllRead(propertyId: string, userId: string): Promise<{ marked: number; unread: number }> {
  const ids = await prisma.notice.findMany({ where: { propertyId, archivedAt: null, reads: { none: { userId } } }, select: { id: true } });
  const at = now();
  const { count } = await prisma.noticeRead.createMany({ data: ids.map((n) => ({ noticeId: n.id, userId, readAt: at })), skipDuplicates: true });
  return { marked: count, unread: await unreadNoticeCount(propertyId, userId) };
}

/** N4 / G6: one reminder email to each active member who hasn't read an urgent notice, once per Dhaka day. */
export async function remindUnread(propertyId: string, id: string, actor: Actor): Promise<Result<{ reminded: number }>> {
  const today = todayIsoInDhaka();
  return inTransaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM notices WHERE id = ${id}::uuid FOR UPDATE`;
    const n = await tx.notice.findFirst({ where: { id, propertyId } });
    if (!n) throw new Abort(failWith("NOT_FOUND"));
    const refusal = canRemind({ priority: n.priority, archivedAt: n.archivedAt, lastRemindedOn: isoDate(n.lastRemindedOn) }, today);
    if (refusal) throw new Abort(failWith(refusal));
    const read = new Set((await tx.noticeRead.findMany({ where: { noticeId: id }, select: { userId: true } })).map((r) => r.userId));
    const unread = (await activeMembers(tx, propertyId)).filter((m) => !read.has(m.id));
    const reminded = await queueNoticeEmails(tx, n, "REMINDER", unread, { authorName: await actorName(tx, n.createdById), stamp: today });
    await tx.notice.update({ where: { id }, data: { lastRemindedOn: dateOf(today) } });
    await audit(tx, { actorId: actor.id, action: "notice.reminded", entityType: "notice", entityId: id, after: { reminded, date: today }, ip: actor.ip, userAgent: actor.userAgent });
    return { reminded };
  });
}
