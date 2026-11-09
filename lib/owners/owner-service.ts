// Owners (Owners PRD F1, F2, F7, F8, F9). Status, %, balance and loan are
// computed on every read (project rule: balances are never stored).
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  balanceLabel,
  entitlementTotal,
  oldestDueMonth,
  ownerStatus,
  paidOut,
  setInForce,
  shareHistory,
  sharePercent,
  totalUnits,
  unitsIn,
} from "@/lib/accounting/owners";
import { audit } from "@/lib/audit";
import { diffFields } from "@/lib/diff";
import { failWith, fieldFail, type Actor, type Result } from "@/lib/api/result";
import { currentMonthKey, monthKey } from "@/lib/periods/month";
import { prisma } from "@/lib/prisma";
import { displayName, rolesOf } from "@/lib/users/dto";
import { initials as initialsOf } from "@/lib/users/initials";
import type { OwnerDetailDto, OwnerDto, OwnerListDto } from "./dto";
import { activeLoans, loanOutstandingByOwner } from "./loan-service";
import { loadShareSets, type ShareSetRow } from "./share-service";

type Db = Prisma.TransactionClient | typeof prisma;

const ownerInclude = { user: { include: { roles: true } } } as const;
type OwnerRow = Prisma.OwnerGetPayload<{ include: typeof ownerInclude }>;

const byOrder = (a: OwnerRow, b: OwnerRow) => a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName);
const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === "P2002";

/** Σ ledger amount per owner (voided originals + reversals cancel). */
export async function balancesByOwner(db: Db, propertyId: string, ownerIds?: string[]): Promise<Map<string, number>> {
  const groups = await db.ownerLedgerEntry.groupBy({
    by: ["ownerId"],
    where: { propertyId, ...(ownerIds ? { ownerId: { in: ownerIds } } : {}) },
    _sum: { amountPaisa: true },
  });
  return new Map(groups.map((g) => [g.ownerId, Number(g._sum.amountPaisa ?? 0)]));
}

type Ctx = { sets: ShareSetRow[]; month: string; total: number; inForce: ShareSetRow | null; viewerId: string | null };

function context(sets: ShareSetRow[], viewerId: string | null): Ctx {
  const month = currentMonthKey();
  const inForce = setInForce(sets, month);
  return { sets, month, inForce, total: totalUnits(inForce), viewerId };
}

function toDto(row: OwnerRow, ctx: Ctx, balance: number, loan: number): OwnerDto {
  const units = unitsIn(ctx.inForce, row.id);
  const { status, leftMonth } = ownerStatus(ctx.sets, row.id, ctx.month);
  return {
    id: row.id,
    userId: row.userId,
    displayName: row.displayName,
    initials: row.initials,
    sortOrder: row.sortOrder,
    note: row.note,
    responsibility: row.user?.houseResponsibility ?? null,
    units,
    sharePercent: sharePercent(units, ctx.total),
    status,
    leftMonth,
    tags: {
      superAdmin: row.user ? rolesOf(row.user).includes("SUPER_ADMIN") : false,
      invitePending: row.user?.status === "INVITED",
      noLogin: row.userId === null,
    },
    isViewer: ctx.viewerId !== null && row.userId === ctx.viewerId,
    balancePaisa: balance,
    balanceLabel: balanceLabel(balance),
    loanOutstandingPaisa: loan,
  };
}

/** Owner list (F1): current + new owners, and former owners separately, in display order. */
export async function listOwners(propertyId: string, viewerId: string | null): Promise<OwnerListDto> {
  const [property, rows, sets, balances, loans] = await Promise.all([
    prisma.property.findUniqueOrThrow({ where: { id: propertyId }, select: { name: true } }),
    prisma.owner.findMany({ where: { propertyId }, include: ownerInclude }),
    loadShareSets(prisma, propertyId),
    balancesByOwner(prisma, propertyId),
    loanOutstandingByOwner(prisma, propertyId),
  ]);
  const ctx = context(sets, viewerId);
  const items = rows.sort(byOrder).map((r) => toDto(r, ctx, balances.get(r.id) ?? 0, loans.get(r.id) ?? 0));
  return {
    houseName: property.name,
    totalUnits: ctx.total,
    owners: items.filter((o) => o.status !== "former"),
    formerOwners: items.filter((o) => o.status === "former"),
  };
}

async function findOwner(db: Db, propertyId: string, id: string) {
  return db.owner.findFirst({ where: { id, propertyId }, include: ownerInclude });
}

/** One owner's list item (used after writes). */
export async function getOwnerItem(propertyId: string, id: string, viewerId: string | null): Promise<OwnerDto | null> {
  const row = await findOwner(prisma, propertyId, id);
  if (!row) return null;
  const [sets, balances, loans] = await Promise.all([
    loadShareSets(prisma, propertyId),
    balancesByOwner(prisma, propertyId, [id]),
    loanOutstandingByOwner(prisma, propertyId, [id]),
  ]);
  return toDto(row, context(sets, viewerId), balances.get(id) ?? 0, loans.get(id) ?? 0);
}

/** Owner detail (F2): list fields + contact, yearly figures, oldest due month and share history. */
export async function getOwnerDetail(propertyId: string, id: string, viewerId: string | null, year: number): Promise<OwnerDetailDto | null> {
  const row = await findOwner(prisma, propertyId, id);
  if (!row) return null;
  const [sets, entries, loans] = await Promise.all([
    loadShareSets(prisma, propertyId),
    prisma.ownerLedgerEntry.findMany({
      where: { propertyId, ownerId: id },
      select: { type: true, amountPaisa: true, entryDate: true, voidedAt: true, period: { select: { month: true } } },
    }),
    activeLoans(prisma, propertyId, [id]),
  ]);
  const ctx = context(sets, viewerId);
  const rows = entries.map((e) => ({
    type: e.type,
    amountPaisa: Number(e.amountPaisa),
    date: e.entryDate.toISOString().slice(0, 10),
    month: monthKey(e.period.month),
    voided: e.voidedAt !== null,
  }));
  const balance = rows.reduce((sum, e) => sum + e.amountPaisa, 0);
  return {
    ...toDto(row, ctx, balance, loans.reduce((sum, l) => sum + l.outstandingPaisa, 0)),
    email: row.user?.email ?? null,
    phone: row.user?.phone ?? null,
    userName: row.user ? displayName(row.user) : null,
    year,
    entitlementPaisa: entitlementTotal(rows, year),
    paidOutPaisa: paidOut(rows, year),
    oldestDueMonth: oldestDueMonth(rows),
    shareHistory: shareHistory(sets, id).map((h) => ({
      shareSetId: h.set.id,
      effectiveMonth: h.set.effectiveMonth,
      units: h.units,
      sharePercent: sharePercent(h.units, h.totalUnits),
      reason: h.set.reason,
      savedBy: h.set.savedBy,
      savedAt: h.set.savedAt,
    })),
    loans,
  };
}

export type CreateOwnerInput = { userId?: string; displayName?: string; initials?: string; sortOrder?: number };
export type PatchOwnerInput = { displayName?: string; initials?: string; sortOrder?: number; note?: string | null; userId?: string | null };

/** The user may be linked only when not already an owner here (Rule 19). */
async function checkLinkable(db: Db, propertyId: string, userId: string, exceptOwnerId?: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return fieldFail("userId", "Unknown user.");
  if (user.status === "INACTIVE") return fieldFail("userId", "That user is deactivated.");
  const taken = await db.owner.findFirst({ where: { propertyId, userId, ...(exceptOwnerId ? { id: { not: exceptOwnerId } } : {}) }, select: { id: true } });
  return taken ? failWith("USER_ALREADY_OWNER") : user;
}

const snapshot = (o: { displayName: string; initials: string; sortOrder: number; note: string | null; userId: string | null }) => ({
  displayName: o.displayName,
  initials: o.initials,
  sortOrder: o.sortOrder,
  note: o.note,
  userId: o.userId,
});

/** Add owner (F7): linked user (name defaulted) or name-only; starts with 0 units. */
export async function createOwner(propertyId: string, input: CreateOwnerInput, actor: Actor): Promise<Result<{ owner: OwnerDto }>> {
  try {
    const created = await prisma.$transaction(async (tx) => {
      let name = input.displayName;
      if (input.userId) {
        const user = await checkLinkable(tx, propertyId, input.userId);
        if ("ok" in user) return user;
        name ??= displayName(user);
      }
      if (!name) return fieldFail("displayName", "Enter a name.");
      const max = await tx.owner.aggregate({ where: { propertyId }, _max: { sortOrder: true } });
      const row = await tx.owner.create({
        data: {
          propertyId,
          userId: input.userId ?? null,
          displayName: name,
          initials: input.initials ?? initialsOf(name),
          sortOrder: input.sortOrder ?? (max._max.sortOrder ?? 0) + 1,
        },
      });
      await audit(tx, { actorId: actor.id, action: "owner.created", entityType: "owner", entityId: row.id, after: snapshot(row), ip: actor.ip, userAgent: actor.userAgent });
      return row;
    });
    if ("ok" in created) return created;
    return { ok: true, owner: (await getOwnerItem(propertyId, created.id, actor.id))! };
  } catch (err) {
    if (isUniqueViolation(err)) return failWith("USER_ALREADY_OWNER");
    throw err;
  }
}

/** Edit owner (F8): changed fields only are written and audited; owners are never deleted. */
export async function updateOwner(propertyId: string, id: string, patch: PatchOwnerInput, actor: Actor): Promise<Result<{ owner: OwnerDto }>> {
  try {
    const r = await prisma.$transaction(async (tx) => {
      const current = await tx.owner.findFirst({ where: { id, propertyId } });
      if (!current) return failWith("NOT_FOUND");
      const change = diffFields(snapshot(current), patch);
      if (!change) return { ok: true as const };
      if (change.after.userId) {
        const user = await checkLinkable(tx, propertyId, change.after.userId, id);
        if ("ok" in user) return user;
      }
      await tx.owner.update({ where: { id }, data: change.after });
      await audit(tx, { actorId: actor.id, action: "owner.updated", entityType: "owner", entityId: id, ...change, ip: actor.ip, userAgent: actor.userAgent });
      return { ok: true as const };
    });
    if (!r.ok) return r;
    return { ok: true, owner: (await getOwnerItem(propertyId, id, actor.id))! };
  } catch (err) {
    if (isUniqueViolation(err)) return failWith("USER_ALREADY_OWNER");
    throw err;
  }
}
