// The money picture behind a request (Requests PRD F2 live info, F4 decision
// context, G7, G11, G12). Read-only; reuses the owner, loan and distribution
// modules so every figure matches the screens it also appears on.
import type { Prisma } from "@/lib/generated/prisma/client";
import { finishesWithin, formatRequestNumber, grantImpact, planInstalment } from "@/lib/accounting/requests";
import type { StaircaseInput } from "@/lib/accounting/distribution";
import { advanceLimit } from "@/lib/accounting/owners";
import { computeMonth, loadOwners, loadPeriods } from "@/lib/distribution/month-data";
import { ruleOf } from "@/lib/distribution/reserve-service";
import { activeLoans } from "@/lib/loans/loan-service";
import { loadAdvanceLimit } from "@/lib/loans/settings-service";
import { listFunds } from "@/lib/master-data/fund-service";
import { ownerBalance, recentEntitlements } from "@/lib/owners/ledger-service";
import { prisma } from "@/lib/prisma";
import type { DecisionContext, FormContextDto } from "./dto";

type Db = Prisma.TransactionClient | typeof prisma;

export type Standing = {
  balancePaisa: number;
  advanceLimitPaisa: number | null;
  advanceUsedPaisa: number;
  loans: { id: string; number: number; outstandingPaisa: number }[];
};

/** Balance, advance limit and use (§7.5: what is already advanced counts), active loans. */
export async function ownerStanding(db: Db, propertyId: string, ownerId: string): Promise<Standing> {
  const balance = await ownerBalance(db, ownerId);
  const { multiplierPct } = await loadAdvanceLimit(db, propertyId);
  const limit = advanceLimit(await recentEntitlements(db, propertyId, ownerId), multiplierPct);
  const loans = (await activeLoans(db, propertyId, [ownerId])).map((l) => ({ id: l.id, number: l.number, outstandingPaisa: l.outstandingPaisa }));
  return { balancePaisa: balance, advanceLimitPaisa: limit, advanceUsedPaisa: Math.max(0, -balance), loans };
}

/** Other PENDING requests of the owner, as numbers (G12). */
export async function pendingNumbers(db: Db, propertyId: string, ownerId: string, exceptId?: string): Promise<string[]> {
  const rows = await db.moneyRequest.findMany({
    where: { propertyId, ownerId, status: "PENDING", ...(exceptId ? { id: { not: exceptId } } : {}) },
    orderBy: { createdAt: "asc" },
    select: { year: true, number: true },
  });
  return rows.map((r) => formatRequestNumber(r.year, r.number));
}

type GrantMonth = { month: string; input: StaircaseInput; shares: { ownerId: string; name: string; units: number }[]; totalUnits: number };

/** G7 grant: the latest open month's figures, loaded once and reused for every grant amount. */
async function grantMonth(propertyId: string): Promise<GrantMonth | null> {
  const periods = await loadPeriods(prisma, propertyId);
  let index = -1;
  for (let i = periods.length - 1; i >= 0; i--) {
    if (periods[i].status === "OPEN") {
      index = i;
      break;
    }
  }
  if (index < 0) return null;
  const owners = await loadOwners(prisma, propertyId);
  const f = await computeMonth(prisma, propertyId, periods, index, owners);
  return {
    month: periods[index].key,
    input: { ...f.totals, previousDeficitPaisa: f.stair.previousDeficitPaisa, rule: ruleOf(f.settings), overridePaisa: periods[index].overridePaisa },
    shares: f.shares,
    totalUnits: f.totalUnits,
  };
}

/** The distributable with and without this grant, and what each owner with units loses (pure). */
function grantFigures(m: GrantMonth, amountPaisa: number) {
  const impact = grantImpact(m.input, m.shares, amountPaisa);
  const shares = new Map(m.shares.map((x) => [x.ownerId, x]));
  return {
    month: m.month,
    impact,
    owners: impact.owners
      .filter((o) => (shares.get(o.ownerId)?.units ?? 0) > 0)
      .map((o) => ({ ownerId: o.ownerId, name: shares.get(o.ownerId)!.name, sharePct: m.totalUnits ? Math.round((shares.get(o.ownerId)!.units * 10000) / m.totalUnits) / 100 : 0, dropPaisa: o.dropPaisa })),
  };
}

async function latestOpenMonth(propertyId: string): Promise<string | null> {
  const p = await prisma.period.findFirst({ where: { propertyId, status: "OPEN" }, orderBy: { month: "desc" }, select: { month: true } });
  return p ? p.month.toISOString().slice(0, 7) : null;
}

/** F2: what the requester sees while filling the form. */
export async function formContext(propertyId: string, ownerId: string, amountPaisa: number | null): Promise<FormContextDto | null> {
  const owner = await prisma.owner.findFirst({ where: { id: ownerId, propertyId }, select: { id: true, displayName: true } });
  if (!owner) return null;
  const s = await ownerStanding(prisma, propertyId, ownerId);
  const month = amountPaisa ? await grantMonth(propertyId) : null;
  const grant = month && amountPaisa ? grantFigures(month, amountPaisa) : null;
  return {
    ownerId,
    ownerName: owner.displayName,
    balancePaisa: s.balancePaisa,
    advanceLimitPaisa: s.advanceLimitPaisa,
    advanceUsedPaisa: s.advanceUsedPaisa,
    activeLoans: s.loans,
    openMonth: await latestOpenMonth(propertyId),
    grantPerTenPctPaisa: grant ? grant.impact.perTenPctPaisa : null,
    pendingNumbers: await pendingNumbers(prisma, propertyId, ownerId),
  };
}

type ContextRow = { id: string; ownerId: string; type: "ADVANCE" | "LOAN" | "GRANT"; amountRequestedPaisa: bigint; amountApprovedPaisa: bigint | null; repaymentPlan: string | null };

/**
 * F4: the Super Admin's context for PENDING / APPROVED requests. Everything
 * shared (funds, open month, grant month figures, pending numbers) is loaded
 * once; each owner's standing once per owner — not once per request.
 */
export async function decisionContexts(propertyId: string, rows: readonly ContextRow[]): Promise<Map<string, DecisionContext>> {
  const out = new Map<string, DecisionContext>();
  if (!rows.length) return out;
  const funds = (await listFunds(propertyId)).filter((f) => f.isActive).map((f) => ({ id: f.id, name: f.name, balancePaisa: f.balancePaisa }));
  const houseFund = funds.reduce((sum, f) => sum + f.balancePaisa, 0);
  const openMonth = await latestOpenMonth(propertyId);
  const month = rows.some((r) => r.type === "GRANT") ? await grantMonth(propertyId) : null;
  const ownerIds = [...new Set(rows.map((r) => r.ownerId))];
  const pending = await prisma.moneyRequest.findMany({
    where: { propertyId, status: "PENDING", ownerId: { in: ownerIds } },
    orderBy: { createdAt: "asc" },
    select: { id: true, ownerId: true, year: true, number: true },
  });
  const standings = new Map<string, Standing>();
  for (const id of ownerIds) standings.set(id, await ownerStanding(prisma, propertyId, id));
  for (const r of rows) {
    const amount = Number(r.amountApprovedPaisa ?? r.amountRequestedPaisa);
    const s = standings.get(r.ownerId)!;
    const plan = planInstalment(r.repaymentPlan);
    const grant = r.type === "GRANT" && month ? grantFigures(month, amount) : null;
    out.set(r.id, {
      balancePaisa: s.balancePaisa,
      loanOutstandingPaisa: s.loans.reduce((sum, l) => sum + l.outstandingPaisa, 0),
      advanceLimitPaisa: s.advanceLimitPaisa,
      advanceUsedPaisa: s.advanceUsedPaisa,
      houseFundPaisa: houseFund,
      funds,
      openMonth,
      advance:
        r.type === "ADVANCE"
          ? {
              usedBeforePaisa: s.advanceUsedPaisa,
              usedAfterPaisa: s.advanceUsedPaisa + amount,
              limitPaisa: s.advanceLimitPaisa,
              overLimit: s.advanceLimitPaisa !== null && s.advanceUsedPaisa + amount > s.advanceLimitPaisa,
            }
          : null,
      loan: r.type === "LOAN" ? { activeLoans: s.loans, planInstalmentPaisa: plan, finishesWithin24Months: finishesWithin(amount, plan, 24) } : null,
      grant: grant ? { month: grant.month, distributableBeforePaisa: grant.impact.distributableBeforePaisa, dropPaisa: grant.impact.dropPaisa, owners: grant.owners } : null,
      pendingOthers: pending.filter((p) => p.ownerId === r.ownerId && p.id !== r.id).map((p) => formatRequestNumber(p.year, p.number)),
      aboveHouseFund: amount > houseFund,
    });
  }
  return out;
}

/** F4 for one request (detail sheet). */
export async function decisionContext(propertyId: string, r: ContextRow): Promise<DecisionContext> {
  return (await decisionContexts(propertyId, [r])).get(r.id)!;
}
