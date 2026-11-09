// Share sets (Owners PRD F5, F6; OWN-03/04; Rules 1–6).
import type { Prisma } from "@/lib/generated/prisma/client";
import { setInForce, sharePercent, totalUnits, unitsIn, type ShareSetLike } from "@/lib/accounting/owners";
import type { SaveIdempotent } from "@/lib/api/idempotency";
import { failWith, fieldFail, type Actor, type Result } from "@/lib/api/result";
import { audit } from "@/lib/audit";
import { now } from "@/lib/clock";
import { addMonths, monthDate, monthKey } from "@/lib/periods/month";
import { prisma } from "@/lib/prisma";
import { displayName } from "@/lib/users/dto";

type Db = Prisma.TransactionClient | typeof prisma;

export type ShareSetRow = ShareSetLike & { reason: string; savedBy: string; savedAt: string };

/** Every share set of the property (small: one per share change). */
export async function loadShareSets(db: Db, propertyId: string): Promise<ShareSetRow[]> {
  const rows = await db.shareSet.findMany({
    where: { propertyId },
    include: { items: true, createdBy: { select: { firstName: true, lastName: true, name: true, username: true } } },
    orderBy: [{ effectiveFrom: "desc" }, { replacedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
  });
  return rows.map((s) => ({
    id: s.id,
    effectiveMonth: monthKey(s.effectiveFrom),
    replaced: s.replacedAt !== null,
    reason: s.reason,
    savedBy: displayName(s.createdBy),
    savedAt: s.createdAt.toISOString(),
    items: s.items.map((i) => ({ ownerId: i.ownerId, units: i.units })),
  }));
}

export type ShareSetDto = {
  id: string;
  effectiveMonth: string;
  reason: string;
  savedBy: string;
  savedAt: string;
  replaced: boolean;
  totalUnits: number;
  items: { ownerId: string; displayName: string; units: number; sharePercent: number }[];
};

function toShareSetDto(s: ShareSetRow, names: Map<string, string>, previous: ShareSetLike | null): ShareSetDto {
  const total = totalUnits(s);
  return {
    id: s.id,
    effectiveMonth: s.effectiveMonth,
    reason: s.reason,
    savedBy: s.savedBy,
    savedAt: s.savedAt,
    replaced: s.replaced,
    totalUnits: total,
    // 0-unit rows only matter in the set that took the owner to 0.
    items: s.items
      .filter((i) => i.units > 0 || unitsIn(previous, i.ownerId) > 0)
      .map((i) => ({ ownerId: i.ownerId, displayName: names.get(i.ownerId) ?? "", units: i.units, sharePercent: sharePercent(i.units, total) }))
      .sort((a, b) => b.units - a.units || a.displayName.localeCompare(b.displayName)),
  };
}

async function ownerNames(db: Db, propertyId: string) {
  const owners = await db.owner.findMany({ where: { propertyId }, select: { id: true, displayName: true } });
  return new Map(owners.map((o) => [o.id, o.displayName]));
}

/** House share timeline, newest effective month first (replaced sets flagged). */
export async function listShareSets(propertyId: string): Promise<ShareSetDto[]> {
  const [sets, names] = await Promise.all([loadShareSets(prisma, propertyId), ownerNames(prisma, propertyId)]);
  return sets.map((s) => toShareSetDto(s, names, setInForce(sets, addMonths(s.effectiveMonth, -1))));
}

export type SaveShareSetInput = { effectiveMonth: string; reason: string; items: { ownerId: string; units: number }[] };

const CLOSED_MSG = "That month is closed. Pick an open month or a later one.";

export async function saveShareSet(propertyId: string, input: SaveShareSetInput, actor: Actor, save?: SaveIdempotent): Promise<Result<{ shareSet: ShareSetDto }>> {
  const ids = input.items.map((i) => i.ownerId);
  if (new Set(ids).size !== ids.length) return fieldFail("items", "Each owner can appear only once.");
  if (input.items.reduce((sum, i) => sum + i.units, 0) <= 0) return fieldFail("items", "Total share units must be above zero.");

  return prisma.$transaction(async (tx) => {
    // Serialise saves for the same month so exactly one set stays active (Rule 6).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`share_set:${propertyId}:${input.effectiveMonth}`}))`;
    const known = await tx.owner.count({ where: { propertyId, id: { in: ids } } });
    if (known !== ids.length) return fieldFail("items", "Unknown owner.");

    const periods = await tx.period.findMany({ where: { propertyId }, select: { month: true, status: true } });
    const months = periods.map((p) => ({ month: monthKey(p.month), status: p.status }));
    const latestClosed = months.filter((p) => p.status === "CLOSED").reduce<string | null>((max, p) => (max && max > p.month ? max : p.month), null);
    const latest = months.reduce<string | null>((max, p) => (max && max > p.month ? max : p.month), null);
    const target = months.find((p) => p.month === input.effectiveMonth);
    if (target?.status === "CLOSED" || (latestClosed && input.effectiveMonth <= latestClosed)) {
      return failWith("PERIOD_CLOSED", { effectiveMonth: CLOSED_MSG });
    }
    if (!target && (!latest || input.effectiveMonth !== addMonths(latest, 1))) {
      return fieldFail("effectiveMonth", "Pick an open month or the next month.");
    }

    const sets = await loadShareSets(tx, propertyId);
    const before = setInForce(sets, input.effectiveMonth);
    const effectiveFrom = monthDate(input.effectiveMonth);
    await tx.shareSet.updateMany({ where: { propertyId, effectiveFrom, replacedAt: null }, data: { replacedAt: now() } });
    const row = await tx.shareSet.create({
      data: { propertyId, effectiveFrom, reason: input.reason, createdById: actor.id, items: { create: input.items } },
    });
    const saved = (await loadShareSets(tx, propertyId)).find((s) => s.id === row.id)!;
    const shareSet = toShareSetDto(saved, await ownerNames(tx, propertyId), setInForce(sets, addMonths(input.effectiveMonth, -1)));
    const brief = (s: ShareSetLike | null) => (s ? { effectiveMonth: s.effectiveMonth, items: s.items } : null);
    await audit(tx, {
      actorId: actor.id,
      action: "share_set.saved",
      entityType: "share_set",
      entityId: row.id,
      before: brief(before),
      after: brief(saved),
      reason: input.reason,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    const data = { shareSet };
    await save?.(tx, data);
    return { ok: true as const, ...data };
  });
}
