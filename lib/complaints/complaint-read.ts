// Complaint list, detail and thread (Notices & Complaints PRD C1, C3, §4;
// design D6, D7, D8). The thread merges comments with status lines read from
// the audit log; visibility always goes through `visibleComplaintWhere`.
import type { Prisma } from "@/lib/generated/prisma/client";
import { attachmentsFor, type AttachmentDto } from "@/lib/attachments/attachment-service";
import { now } from "@/lib/clock";
import type { Locale } from "@/lib/i18n";
import { monthDate } from "@/lib/periods/month";
import { prisma } from "@/lib/prisma";
import { displayName } from "@/lib/users/dto";
import { linkKey, resolveLinks, type LinkItem, type LinkRef } from "./links";
import { canEditComment, canPublish, canReopen, isLive, isUnseen, LIST_ORDER, type ComplaintStatus } from "./rules";
import { CLOSED_STATUSES, visibleComplaintWhere, type ComplaintViewer } from "./visibility";

type Db = Prisma.TransactionClient | typeof prisma;

export const COMPLAINT_PAGE = 50;
export const COMPLAINT_MAX = 200;
export const COMPLAINT_FILTERS = ["all", "open", "in_review", "closed", "mine"] as const;
export type ComplaintFilter = (typeof COMPLAINT_FILTERS)[number];

/** Viewer for reads: complaint visibility plus what labels may show. */
export type ReadViewer = ComplaintViewer & { requestViewAll: boolean; decide: boolean; locale: Locale };

export type ComplaintDto = {
  id: string;
  title: string;
  status: ComplaintStatus;
  visibility: "ALL" | "ADMIN";
  reopened: boolean;
  aboutAdmin: boolean;
  authorId: string;
  authorName: string;
  mine: boolean;
  createdAt: string;
  closedAt: string | null;
  link: LinkItem | null;
  commentCount: number;
  unseen: boolean;
};

export type ThreadItem =
  | {
      kind: "comment";
      id: string;
      authorId: string;
      authorName: string;
      isAdmin: boolean;
      body: string | null;
      hiddenReason: string | null;
      createdAt: string;
      editedAt: string | null;
      attachments: AttachmentDto[];
      editableUntil: string | null;
    }
  | { kind: "status"; id: string; actorName: string; status: ComplaintStatus | "PUBLIC"; note: string | null; at: string };

export type ComplaintDetailDto = ComplaintDto & {
  body: string;
  attachments: AttachmentDto[];
  resolution: { note: string; byName: string; at: string; fix: LinkItem | null } | null;
  thread: ThreadItem[];
  actions: { comment: boolean; withdraw: boolean; reopen: boolean; publish: boolean; decide: boolean; hide: boolean };
};

const NAME = { select: { firstName: true, lastName: true, name: true, username: true } } as const;
const INCLUDE = { createdBy: NAME, resolvedBy: NAME } as const;
type Row = Prisma.ComplaintGetPayload<{ include: typeof INCLUDE }>;

const ref = (type: Row["linkType"], id: string | null): LinkRef | null => (type && id ? { type, id } : null);

/** User ids holding Super Admin here (Admin tag on comments). */
async function adminIds(db: Db, propertyId: string): Promise<Set<string>> {
  const rows = await db.userRole.findMany({ where: { role: "SUPER_ADMIN", OR: [{ propertyId: null }, { propertyId }] }, select: { userId: true } });
  return new Set(rows.map((r) => r.userId));
}

/** Complaint ids among `rows` where the viewer takes part and someone else commented since they last looked (D8). */
async function unseenIds(db: Db, rows: readonly { id: string; createdById: string; createdAt: Date }[], userId: string): Promise<Set<string>> {
  const out = new Set<string>();
  if (!rows.length) return out;
  const ids = rows.map((r) => r.id);
  const comments = await db.complaintComment.findMany({ where: { complaintId: { in: ids }, hiddenAt: null }, select: { complaintId: true, authorId: true, createdAt: true } });
  const views = new Map((await db.complaintView.findMany({ where: { complaintId: { in: ids }, userId } })).map((v) => [v.complaintId, v.seenAt]));
  for (const r of rows) {
    const mineC = comments.filter((c) => c.complaintId === r.id && c.authorId === userId);
    const others = comments.filter((c) => c.complaintId === r.id && c.authorId !== userId).map((c) => c.createdAt);
    const own = mineC.length ? new Date(Math.max(...mineC.map((c) => c.createdAt.getTime()))) : null;
    if (isUnseen({ isAuthor: r.createdById === userId, createdAt: r.createdAt, lastSeenAt: views.get(r.id) ?? null, ownLastCommentAt: own }, others)) out.add(r.id);
  }
  return out;
}

async function toDtos(db: Db, propertyId: string, rows: readonly Row[], viewer: ReadViewer): Promise<ComplaintDto[]> {
  const ids = rows.map((r) => r.id);
  const counts = new Map(
    (await db.complaintComment.groupBy({ by: ["complaintId"], where: { complaintId: { in: ids }, hiddenAt: null }, _count: { _all: true } })).map((c) => [c.complaintId, c._count._all]),
  );
  const links = await resolveLinks(db, propertyId, rows.map((r) => ref(r.linkType, r.linkId)), viewer.locale, { userId: viewer.userId, requestViewAll: viewer.requestViewAll });
  const unseen = await unseenIds(db, rows, viewer.userId);
  return rows.map((r) => {
    const l = ref(r.linkType, r.linkId);
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      visibility: r.visibility,
      reopened: r.reopened,
      aboutAdmin: r.aboutAdmin,
      authorId: r.createdById,
      authorName: displayName(r.createdBy),
      mine: r.createdById === viewer.userId,
      createdAt: r.createdAt.toISOString(),
      closedAt: r.closedAt?.toISOString() ?? null,
      link: l ? (links.get(linkKey(l)) ?? { ...l, subject: null, date: null, amountPaisa: null, month: null, hidden: true }) : null,
      commentCount: counts.get(r.id) ?? 0,
      unseen: unseen.has(r.id),
    };
  });
}

export type ListQuery = { filter?: ComplaintFilter; month?: string; limit?: number };
export type ComplaintListDto = { items: ComplaintDto[]; more: boolean };

const FILTER: Record<ComplaintFilter, (userId: string) => Prisma.ComplaintWhereInput> = {
  all: () => ({}),
  open: () => ({ status: "OPEN" }),
  in_review: () => ({ status: "IN_REVIEW" }),
  closed: () => ({ status: { in: [...CLOSED_STATUSES] } }),
  mine: (userId) => ({ createdById: userId }),
};

/** C1: visible complaints, filtered, Open → In review (oldest first) → closed (newest first); one bounded query per group. */
export async function listComplaints(propertyId: string, viewer: ReadViewer, q: ListQuery = {}): Promise<ComplaintListDto> {
  const limit = Math.min(Math.max(q.limit ?? COMPLAINT_PAGE, 1), COMPLAINT_MAX);
  const month = q.month ? await prisma.period.findFirst({ where: { propertyId, month: monthDate(q.month) }, select: { id: true } }) : null;
  if (q.month && !month) return { items: [], more: false };
  const where: Prisma.ComplaintWhereInput[] = [visibleComplaintWhere(propertyId, viewer), FILTER[q.filter ?? "all"](viewer.userId), month ? { periodId: month.id } : {}];
  const rows: Row[] = [];
  for (const { statuses, newestFirst } of LIST_ORDER) {
    const left = limit + 1 - rows.length;
    if (left <= 0) break;
    const dir = newestFirst ? "desc" : "asc";
    rows.push(...(await prisma.complaint.findMany({ where: { AND: [...where, { status: { in: [...statuses] } }] }, include: INCLUDE, orderBy: [{ createdAt: dir }, { id: dir }], take: left })));
  }
  return { items: await toDtos(prisma, propertyId, rows.slice(0, limit), viewer), more: rows.length > limit };
}

/** The complaint row if the viewer may see it (else null → 404). */
export async function findVisible(db: Db, propertyId: string, id: string, viewer: ComplaintViewer) {
  return db.complaint.findFirst({ where: { AND: [{ id }, visibleComplaintWhere(propertyId, viewer)] }, include: INCLUDE });
}

const STATUS_ACTIONS = ["complaint.status_changed", "complaint.withdrawn", "complaint.reopened", "complaint.published"] as const;

async function thread(db: Db, propertyId: string, id: string, viewer: ReadViewer): Promise<ThreadItem[]> {
  const admins = await adminIds(db, propertyId);
  const comments = await db.complaintComment.findMany({ where: { complaintId: id }, include: { author: NAME }, orderBy: { createdAt: "asc" } });
  const files = await attachmentsFor(db, comments.filter((c) => !c.hiddenAt).map((c) => c.id));
  const audits = await db.auditLog.findMany({ where: { entityType: "complaint", entityId: id, action: { in: [...STATUS_ACTIONS] } }, orderBy: { id: "asc" } });
  const actors = new Map((await db.user.findMany({ where: { id: { in: audits.map((a) => a.actorId).filter((x): x is string => !!x) } }, select: { id: true, ...NAME.select } })).map((u) => [u.id, displayName(u)]));
  const at = now();
  const items: (ThreadItem & { t: number; o: number })[] = [
    ...audits.map((a) => {
      const after = (a.after ?? {}) as { status?: ComplaintStatus };
      const status: ComplaintStatus | "PUBLIC" = a.action === "complaint.published" ? "PUBLIC" : a.action === "complaint.withdrawn" ? "WITHDRAWN" : a.action === "complaint.reopened" ? "OPEN" : (after.status ?? "OPEN");
      return { kind: "status" as const, id: `a${a.id}`, actorName: actors.get(a.actorId ?? "") ?? "", status, note: a.reason, at: a.createdAt.toISOString(), t: a.createdAt.getTime(), o: 0 };
    }),
    ...comments.map((c) => {
      const editable = canEditComment({ authorId: c.authorId, createdAt: c.createdAt, hiddenAt: c.hiddenAt }, viewer.userId, at) === null;
      return {
        kind: "comment" as const,
        id: c.id,
        authorId: c.authorId,
        authorName: displayName(c.author),
        isAdmin: admins.has(c.authorId),
        body: c.hiddenAt ? null : c.body,
        hiddenReason: c.hiddenAt ? c.hiddenReason : null,
        createdAt: c.createdAt.toISOString(),
        editedAt: c.editedAt?.toISOString() ?? null,
        attachments: c.hiddenAt ? [] : (files.get(c.id) ?? []),
        editableUntil: editable ? new Date(c.createdAt.getTime() + 15 * 60_000).toISOString() : null,
        t: c.createdAt.getTime(),
        o: 1,
      };
    }),
  ];
  return items.sort((a, b) => a.t - b.t || a.o - b.o).map(({ t: _t, o: _o, ...rest }) => rest as ThreadItem);
}

/** C3: the full complaint as this viewer may see it; null when missing or invisible. */
export async function complaintDetail(db: Db, propertyId: string, id: string, viewer: ReadViewer): Promise<ComplaintDetailDto | null> {
  const row = await findVisible(db, propertyId, id, viewer);
  if (!row) return null;
  const [dto] = await toDtos(db, propertyId, [row], viewer);
  const fixRef = ref(row.fixType, row.fixId);
  const fix = fixRef ? ((await resolveLinks(db, propertyId, [fixRef], viewer.locale, { userId: viewer.userId, requestViewAll: viewer.requestViewAll })).get(linkKey(fixRef)) ?? null) : null;
  const author = row.createdById === viewer.userId;
  const closed = row.status === "RESOLVED" || row.status === "REJECTED";
  return {
    ...dto,
    body: row.body,
    attachments: (await attachmentsFor(db, [row.id])).get(row.id) ?? [],
    resolution: closed && row.resolutionNote && row.resolvedAt ? { note: row.resolutionNote, byName: row.resolvedBy ? displayName(row.resolvedBy) : "", at: row.resolvedAt.toISOString(), fix } : null,
    thread: await thread(db, propertyId, id, viewer),
    actions: {
      comment: isLive(row.status),
      withdraw: author && isLive(row.status),
      reopen: author && canReopen(row, now()) === null,
      publish: canPublish(row, viewer.userId) === null,
      decide: viewer.decide && isLive(row.status),
      hide: viewer.decide,
    },
  };
}

/** Visible complaints the viewer takes part in with unseen comments (nav badge, §11). */
export async function unseenCount(propertyId: string, viewer: ComplaintViewer): Promise<number> {
  const rows = await prisma.complaint.findMany({
    where: { AND: [visibleComplaintWhere(propertyId, viewer), { OR: [{ createdById: viewer.userId }, { comments: { some: { authorId: viewer.userId } } }] }] },
    select: { id: true, createdById: true, createdAt: true },
  });
  return (await unseenIds(prisma, rows, viewer.userId)).size;
}
