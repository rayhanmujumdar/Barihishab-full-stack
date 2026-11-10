// Request list, detail and timeline (Requests PRD F1, F9, F12; design D6, D7).
// Visibility is decided here once: own requests in full, others' only once
// paid out and only their public fields.
import type { Prisma } from "@/lib/generated/prisma/client";
import { formatRequestNumber, isOverdue, visibleTo, type RequestStatus } from "@/lib/accounting/requests";
import { todayIsoInDhaka } from "@/lib/clock";
import { monthKey } from "@/lib/periods/month";
import { prisma } from "@/lib/prisma";
import { displayName } from "@/lib/users/dto";
import { decisionContext } from "./context-service";
import type { LinkedEntry, RequestAttachmentDto, RequestDetailDto, RequestDto, RequestListDto, RequestType, TimelineItem } from "./dto";

type Db = Prisma.TransactionClient | typeof prisma;

/** Who is looking: their user id and whether they hold `request.view.all`. */
export type RequestViewer = { userId: string; viewAll: boolean };

const NAME = { select: { firstName: true, lastName: true, name: true, username: true } } as const;
export const REQUEST_INCLUDE = {
  owner: { select: { displayName: true, userId: true } },
  createdBy: NAME,
  decidedBy: NAME,
} as const;
export type RequestRow = Prisma.MoneyRequestGetPayload<{ include: typeof REQUEST_INCLUDE }>;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const HISTORY: RequestStatus[] = ["DISBURSED", "REJECTED", "CANCELLED", "WITHDRAWN"];

/** Linked advance / loan / expense per request (design D1: links live on the entries). */
export async function linkedEntries(db: Db, ids: string[]): Promise<Map<string, LinkedEntry>> {
  const out = new Map<string, LinkedEntry>();
  if (!ids.length) return out;
  const ledger = await db.ownerLedgerEntry.findMany({ where: { requestId: { in: ids } }, select: { id: true, requestId: true, ownerId: true, voidedAt: true, period: { select: { month: true } } } });
  const loans = await db.loan.findMany({ where: { requestId: { in: ids } }, select: { id: true, requestId: true, ownerId: true, number: true, status: true, disbursedOn: true } });
  const txns = await db.houseTransaction.findMany({ where: { requestId: { in: ids } }, select: { id: true, requestId: true, beneficiaryOwnerId: true, voidedAt: true, period: { select: { month: true } } } });
  for (const e of ledger) {
    const month = monthKey(e.period.month);
    out.set(e.requestId!, { kind: "ADVANCE", id: e.id, label: "Advance on the owner's statement", loanNumber: null, month, ownerId: e.ownerId, voided: e.voidedAt !== null });
  }
  for (const l of loans) {
    out.set(l.requestId!, { kind: "LOAN", id: l.id, label: `Loan L${l.number}`, loanNumber: l.number, month: iso(l.disbursedOn).slice(0, 7), ownerId: l.ownerId, voided: l.status === "CANCELLED" });
  }
  for (const t of txns) {
    const month = monthKey(t.period.month);
    out.set(t.requestId!, { kind: "EXPENSE", id: t.id, label: `Expense in ${month}`, loanNumber: null, month, ownerId: t.beneficiaryOwnerId ?? "", voided: t.voidedAt !== null });
  }
  return out;
}

async function attachmentCounts(db: Db, ids: string[], publicOnly: Set<string>): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const rows = await db.attachment.findMany({ where: { entityType: "money_request", entityId: { in: ids }, removedAt: null }, select: { entityId: true, isPrivate: true } });
  const out = new Map<string, number>();
  for (const r of rows) {
    if (r.isPrivate && publicOnly.has(r.entityId!)) continue;
    out.set(r.entityId!, (out.get(r.entityId!) ?? 0) + 1);
  }
  return out;
}

/** Builds DTOs for rows the viewer may see (callers filter `none` first). */
export async function toDtos(db: Db, rows: readonly RequestRow[], viewer: RequestViewer): Promise<RequestDto[]> {
  const ids = rows.map((r) => r.id);
  const vis = new Map(rows.map((r) => [r.id, visibleTo({ status: r.status, ownerUserId: r.owner.userId, createdById: r.createdById }, viewer)]));
  const limitedIds = new Set(ids.filter((id) => vis.get(id) === "limited"));
  const links = await linkedEntries(db, ids);
  const files = await attachmentCounts(db, ids, limitedIds);
  const today = todayIsoInDhaka();
  return rows.map((r) => {
    const limited = vis.get(r.id) === "limited";
    const neededBy = iso(r.neededBy);
    // Another owner's paid-out request shows only what was paid and when (Rule 12):
    // no asked amount or dates, so a negotiation stays between requester and Admin.
    const paidOn = r.disbursedAt ? todayIsoInDhaka(r.disbursedAt) : neededBy;
    const approved = r.amountApprovedPaisa === null ? null : Number(r.amountApprovedPaisa);
    return {
      id: r.id,
      number: formatRequestNumber(r.year, r.number),
      ownerId: r.ownerId,
      ownerName: r.owner.displayName,
      type: r.type as RequestType,
      status: r.status,
      amountRequestedPaisa: limited ? (approved ?? 0) : Number(r.amountRequestedPaisa),
      amountApprovedPaisa: approved,
      reason: r.reason,
      neededBy: limited ? paidOn : neededBy,
      repaymentPlan: limited ? null : r.repaymentPlan,
      askedOn: limited ? paidOn : todayIsoInDhaka(r.createdAt),
      isSelf: r.isSelf,
      recordedBy: r.recordedOnBehalf && !limited ? displayName(r.createdBy) : null,
      decidedBy: r.decidedBy ? displayName(r.decidedBy) : null,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      decisionNote: limited ? null : r.decisionNote,
      disbursedAt: r.disbursedAt?.toISOString() ?? null,
      overdue: isOverdue({ status: r.status, neededBy }, today),
      mine: r.owner.userId === viewer.userId || r.createdById === viewer.userId,
      unseen: r.decisionUnseen && r.owner.userId === viewer.userId,
      limited,
      attachmentCount: files.get(r.id) ?? 0,
      linkedEntry: links.get(r.id) ?? null,
    };
  });
}

import { MAX_LIMIT, PAGE_SIZE } from "./page-size";

export { MAX_LIMIT, PAGE_SIZE };

export type ListFilters = { ownerId?: string; type?: RequestType; status?: RequestStatus; year?: number; limit?: number };

/** F1/F12: the Super Admin's three sections, or an owner's own + everyone's paid out. */
export async function listRequests(propertyId: string, viewer: RequestViewer, filters: ListFilters = {}): Promise<RequestListDto> {
  const limit = Math.min(Math.max(filters.limit ?? PAGE_SIZE, 1), MAX_LIMIT);
  if (viewer.viewAll) {
    const open = await prisma.moneyRequest.findMany({ where: { propertyId, status: { in: ["PENDING", "APPROVED"] } }, include: REQUEST_INCLUDE, orderBy: [{ neededBy: "asc" }, { createdAt: "asc" }] });
    const history = await prisma.moneyRequest.findMany({
      where: {
        propertyId,
        status: filters.status && HISTORY.includes(filters.status) ? filters.status : { in: HISTORY },
        ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.year ? { year: filters.year } : {}),
      },
      include: REQUEST_INCLUDE,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: limit + 1,
    });
    const years = await prisma.moneyRequest.findMany({ where: { propertyId }, distinct: ["year"], select: { year: true }, orderBy: { year: "desc" } });
    const openDtos = await toDtos(prisma, open, viewer);
    // Overdue first (needed-by already ascending), then the rest (F1).
    const pending = openDtos.filter((r) => r.status === "PENDING").sort((a, b) => Number(b.overdue) - Number(a.overdue));
    return {
      scope: "all",
      pending,
      approved: openDtos.filter((r) => r.status === "APPROVED"),
      history: await toDtos(prisma, history.slice(0, limit), viewer),
      historyMore: history.length > limit,
      years: years.map((y) => y.year),
    };
  }
  const mine = await prisma.moneyRequest.findMany({
    where: { propertyId, OR: [{ owner: { userId: viewer.userId } }, { createdById: viewer.userId }] },
    include: REQUEST_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  const paid = await prisma.moneyRequest.findMany({ where: { propertyId, status: "DISBURSED" }, include: REQUEST_INCLUDE, orderBy: [{ disbursedAt: "desc" }, { createdAt: "desc" }], take: limit + 1 });
  return { scope: "own", mine: await toDtos(prisma, mine, viewer), paidOut: await toDtos(prisma, paid.slice(0, limit), viewer), paidOutMore: paid.length > limit };
}

/** Badge (design D11): the requester has now seen their decisions. Explicit POST — reads never write. */
export async function markDecisionsSeen(propertyId: string, userId: string): Promise<number> {
  const { count } = await prisma.moneyRequest.updateMany({ where: { propertyId, decisionUnseen: true, owner: { userId } }, data: { decisionUnseen: false } });
  return count;
}

/** The request as this viewer may see it; null when it doesn't exist or is private to others (404). */
export async function findVisible(db: Db, propertyId: string, id: string, viewer: RequestViewer): Promise<RequestRow | null> {
  const row = await db.moneyRequest.findFirst({ where: { id, propertyId }, include: REQUEST_INCLUDE });
  if (!row) return null;
  return visibleTo({ status: row.status, ownerUserId: row.owner.userId, createdById: row.createdById }, viewer) === "none" ? null : row;
}

const TIMELINE: Record<string, TimelineItem["kind"]> = {
  "request.submitted": "SUBMITTED",
  "request.recorded": "RECORDED",
  "request.edited": "EDITED",
  "request.approved": "APPROVED",
  "request.rejected": "REJECTED",
  "request.withdrawn": "WITHDRAWN",
  "request.cancelled": "CANCELLED",
  "request.disbursed": "DISBURSED",
};

/** F9: every status change with who and when, oldest first (design D6). */
export async function timeline(db: Db, id: string, limited: boolean): Promise<TimelineItem[]> {
  const logs = await db.auditLog.findMany({ where: { entityType: "money_request", entityId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const actorIds = [...new Set(logs.flatMap((l) => (l.actorId ? [l.actorId] : [])))];
  const users = await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, ...NAME.select } });
  const names = new Map(users.map((u) => [u.id, displayName(u)]));
  const items: TimelineItem[] = [];
  for (const l of logs) {
    const kind = TIMELINE[l.action];
    if (!kind) continue;
    if (limited && kind !== "APPROVED" && kind !== "DISBURSED") continue;
    const after = (l.after ?? {}) as Record<string, unknown>;
    const num = (k: string) => (typeof after[k] === "number" ? (after[k] as number) : null);
    const str = (k: string) => (typeof after[k] === "string" ? (after[k] as string) : null);
    items.push({
      kind,
      at: l.createdAt.toISOString(),
      by: l.actorId ? (names.get(l.actorId) ?? null) : null,
      amountPaisa: kind === "APPROVED" ? num("amountApprovedPaisa") : kind === "SUBMITTED" || kind === "RECORDED" || kind === "EDITED" || kind === "DISBURSED" ? num("amountPaisa") : null,
      note: limited ? null : (l.reason ?? null),
      date: kind === "DISBURSED" ? str("date") : null,
      method: kind === "DISBURSED" && !limited ? (str("method") as TimelineItem["method"]) : null,
      referenceNo: kind === "DISBURSED" && !limited ? str("referenceNo") : null,
    });
  }
  return items;
}

/** F9 detail: fields, files (private ones only for privileged viewers), timeline, decision context. */
export async function requestDetail(propertyId: string, id: string, viewer: RequestViewer): Promise<RequestDetailDto | null> {
  const row = await findVisible(prisma, propertyId, id, viewer);
  if (!row) return null;
  const [request] = await toDtos(prisma, [row], viewer);
  const files = await prisma.attachment.findMany({
    where: { entityType: "money_request", entityId: id, removedAt: null, ...(request.limited ? { isPrivate: false } : {}) },
    orderBy: { createdAt: "asc" },
    select: { id: true, fileName: true, mime: true, sizeBytes: true, isPrivate: true },
  });
  const attachments: RequestAttachmentDto[] = files;
  const context = viewer.viewAll && (row.status === "PENDING" || row.status === "APPROVED") ? await decisionContext(propertyId, row) : null;
  return { request, attachments, timeline: await timeline(prisma, id, request.limited), context };
}

/** Nav badge (design D11): pending for the Super Admin; own unseen decisions for owners. */
export async function requestBadge(propertyId: string, viewer: RequestViewer): Promise<number> {
  return viewer.viewAll
    ? prisma.moneyRequest.count({ where: { propertyId, status: "PENDING" } })
    : prisma.moneyRequest.count({ where: { propertyId, decisionUnseen: true, owner: { userId: viewer.userId } } });
}

/** F14 Home (owner): the newest own request still open. */
export async function latestOpenRequest(propertyId: string, viewer: RequestViewer): Promise<RequestDto | null> {
  const row = await prisma.moneyRequest.findFirst({
    where: { propertyId, status: { in: ["PENDING", "APPROVED"] }, OR: [{ owner: { userId: viewer.userId } }, { createdById: viewer.userId }] },
    include: REQUEST_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return row ? (await toDtos(prisma, [row], viewer))[0] : null;
}
