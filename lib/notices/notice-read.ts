// Notice list, read counts, who-has-read and Home's pinned notices
// (Notices & Complaints PRD N1, N4, N5, §12.1; design D4, D5).
import type { Prisma } from "@/lib/generated/prisma/client";
import { attachmentsFor, type AttachmentDto } from "@/lib/attachments/attachment-service";
import { todayIsoInDhaka } from "@/lib/clock";
import { prisma } from "@/lib/prisma";
import { activeMembers, activeMemberWhere } from "@/lib/users/members";
import { displayName } from "@/lib/users/dto";
import { isPinnedOn, orderNotices } from "./rules";

type Db = Prisma.TransactionClient | typeof prisma;

export const NOTICE_PAGE = 50;
export const NOTICE_MAX = 200;

export type NoticeDto = {
  id: string;
  title: string;
  body: string;
  priority: "NORMAL" | "URGENT";
  /** Effectively pinned today (Asia/Dhaka). */
  pinned: boolean;
  pinUntil: string | null;
  publishedAt: string;
  authorName: string;
  editedAt: string | null;
  archivedAt: string | null;
  attachments: AttachmentDto[];
  readCount: number;
  memberCount: number;
  read: boolean;
  /** Remind unread already used today. */
  remindedToday: boolean;
};

export type NoticeListDto = { items: NoticeDto[]; more: boolean; activeMembers: number; unread: number; reachEmail: number | null };

const NAME = { select: { firstName: true, lastName: true, name: true, username: true } } as const;
const INCLUDE = { createdBy: NAME } as const;
type NoticeRow = Prisma.NoticeGetPayload<{ include: typeof INCLUDE }>;

export const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Ids of current active members (they are both the "m" and the only reads counted). */
async function memberIds(db: Db, propertyId: string): Promise<string[]> {
  return (await db.user.findMany({ where: activeMemberWhere(propertyId), select: { id: true } })).map((u) => u.id);
}

async function toDtos(db: Db, rows: readonly NoticeRow[], viewerId: string, members: string[]): Promise<NoticeDto[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const counts = await db.noticeRead.groupBy({ by: ["noticeId"], where: { noticeId: { in: ids }, userId: { in: members } }, _count: { _all: true } });
  const countOf = new Map(counts.map((c) => [c.noticeId, c._count._all]));
  const mine = new Set((await db.noticeRead.findMany({ where: { noticeId: { in: ids }, userId: viewerId }, select: { noticeId: true } })).map((r) => r.noticeId));
  const files = await attachmentsFor(db, ids);
  const today = todayIsoInDhaka();
  return rows.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    priority: n.priority,
    pinned: isPinnedOn({ pinned: n.pinned, pinUntil: isoDate(n.pinUntil), archivedAt: n.archivedAt }, today),
    pinUntil: isoDate(n.pinUntil),
    publishedAt: n.publishedAt.toISOString(),
    authorName: displayName(n.createdBy),
    editedAt: n.editedAt?.toISOString() ?? null,
    archivedAt: n.archivedAt?.toISOString() ?? null,
    attachments: files.get(n.id) ?? [],
    readCount: countOf.get(n.id) ?? 0,
    memberCount: members.length,
    read: mine.has(n.id),
    remindedToday: isoDate(n.lastRemindedOn) === today,
  }));
}

/** Live notices pinned first (newest first), then newest first; or archived newest first. */
export async function listNotices(
  propertyId: string,
  viewer: { userId: string; manage: boolean },
  opts: { archived?: boolean; limit?: number } = {},
): Promise<NoticeListDto> {
  const limit = Math.min(Math.max(opts.limit ?? NOTICE_PAGE, 1), NOTICE_MAX);
  const members = await activeMembers(prisma, propertyId);
  const ids = members.map((m) => m.id);
  const rows = await prisma.notice.findMany({
    where: { propertyId, archivedAt: opts.archived ? { not: null } : null },
    include: INCLUDE,
    orderBy: opts.archived ? { archivedAt: "desc" } : { publishedAt: "desc" },
  });
  const today = todayIsoInDhaka();
  const sorted = opts.archived
    ? rows
    : orderNotices(rows.map((r) => ({ ...r, pinnedNow: isPinnedOn({ pinned: r.pinned, pinUntil: isoDate(r.pinUntil), archivedAt: r.archivedAt }, today) })));
  return {
    items: await toDtos(prisma, sorted.slice(0, limit), viewer.userId, ids),
    more: sorted.length > limit,
    activeMembers: members.length,
    unread: await unreadNoticeCount(propertyId, viewer.userId),
    reachEmail: viewer.manage ? members.filter((m) => m.emailNotices).length : null,
  };
}

/** One notice as the viewer sees it (after a write), or null. */
export async function noticeDto(db: Db, propertyId: string, id: string, viewerId: string): Promise<NoticeDto | null> {
  const row = await db.notice.findFirst({ where: { id, propertyId }, include: INCLUDE });
  return row ? (await toDtos(db, [row], viewerId, await memberIds(db, propertyId)))[0] : null;
}

/** Live notices the viewer hasn't read (nav badge, "Mark all as read"). */
export async function unreadNoticeCount(propertyId: string, userId: string): Promise<number> {
  return prisma.notice.count({ where: { propertyId, archivedAt: null, reads: { none: { userId } } } });
}

/** G6: Read (with time, oldest first) / Not yet, over current active members. */
export async function whoRead(propertyId: string, id: string): Promise<{ read: { userId: string; name: string; readAt: string }[]; notRead: { userId: string; name: string }[] } | null> {
  const notice = await prisma.notice.findFirst({ where: { id, propertyId }, select: { id: true } });
  if (!notice) return null;
  const members = await activeMembers(prisma, propertyId);
  const reads = new Map((await prisma.noticeRead.findMany({ where: { noticeId: id } })).map((r) => [r.userId, r.readAt]));
  const read = members
    .filter((m) => reads.has(m.id))
    .map((m) => ({ userId: m.id, name: m.name, readAt: reads.get(m.id)! }))
    .sort((a, b) => a.readAt.getTime() - b.readAt.getTime())
    .map((r) => ({ ...r, readAt: r.readAt.toISOString() }));
  return { read, notRead: members.filter((m) => !reads.has(m.id)).map((m) => ({ userId: m.id, name: m.name })) };
}

export type PinnedNotice = { id: string; title: string; body: string; urgent: boolean; date: string; unread: boolean };

/** N5: up to 3 effectively pinned notices, newest first, and whether more exist. */
export async function pinnedForHome(propertyId: string, userId: string): Promise<{ items: PinnedNotice[]; more: boolean }> {
  const today = todayIsoInDhaka();
  const rows = await prisma.notice.findMany({
    where: { propertyId, archivedAt: null, pinned: true, OR: [{ pinUntil: null }, { pinUntil: { gte: new Date(`${today}T00:00:00Z`) } }] },
    orderBy: { publishedAt: "desc" },
    take: 4,
    select: { id: true, title: true, body: true, priority: true, publishedAt: true, reads: { where: { userId }, select: { userId: true } } },
  });
  return {
    items: rows.slice(0, 3).map((n) => ({ id: n.id, title: n.title, body: n.body, urgent: n.priority === "URGENT", date: todayIsoInDhaka(n.publishedAt), unread: n.reads.length === 0 })),
    more: rows.length > 3,
  };
}
