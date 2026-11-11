// Fund accounts report (Reports PRD F11, G11): opening → moves → closing per
// account for a month or a year. Moves are attributed to the month they are
// booked to (loans to their disbursal month), with the same signs as
// `fundMovements`, so the latest month closes at the Settings balance. An
// account's opening balance counts from its opening month on.
import { fundRow, type FundMoves } from "@/lib/accounting/reports";
import { monthKey } from "@/lib/periods/month";
import { prisma } from "@/lib/prisma";
import type { FundsReportDto } from "./dto";
import { loadHouse, loadPeriods, yearsOf } from "./month-figures";

type Range = { kind: "month"; month: string } | { kind: "year"; year: number };

const empty = (): FundMoves => ({ incomePaisa: 0, expensesPaisa: 0, ownerPaymentsPaisa: 0, loansOutPaisa: 0, loanRepaymentsPaisa: 0 });

export async function fundsReport(propertyId: string, range: Range): Promise<FundsReportDto> {
  const [start, end] = range.kind === "month" ? [range.month, range.month] : [`${range.year}-01`, `${range.year}-12`];
  const [periods, funds, txns, ledger, moves, loans, house] = await Promise.all([
    loadPeriods(prisma, propertyId),
    prisma.fundAccount.findMany({ where: { propertyId }, orderBy: { createdAt: "asc" } }),
    prisma.houseTransaction.groupBy({ by: ["fundAccountId", "kind", "periodId"], where: { propertyId, voidedAt: null }, _sum: { amountPaisa: true } }),
    prisma.ownerLedgerEntry.groupBy({ by: ["fundAccountId", "periodId"], where: { propertyId, fundAccountId: { not: null } }, _sum: { amountPaisa: true } }),
    prisma.loanMovement.groupBy({ by: ["fundAccountId", "periodId"], where: { propertyId }, _sum: { amountPaisa: true } }),
    prisma.loan.findMany({ where: { propertyId }, select: { fundAccountId: true, principalPaisa: true, disbursedOn: true } }),
    loadHouse(propertyId),
  ]);
  const monthOf = new Map(periods.map((p) => [p.id, p.key]));
  const buckets = new Map<string, { before: FundMoves; within: FundMoves; touched: boolean }>();
  const bucket = (fundId: string, month: string | undefined) => {
    if (!month || month > end) return null;
    const b = buckets.get(fundId) ?? { before: empty(), within: empty(), touched: false };
    buckets.set(fundId, b);
    if (month >= start) {
      b.touched = true;
      return b.within;
    }
    return b.before;
  };
  for (const g of txns) {
    const m = bucket(g.fundAccountId, monthOf.get(g.periodId));
    if (m) m[g.kind === "INCOME" ? "incomePaisa" : "expensesPaisa"] += Number(g._sum.amountPaisa ?? 0);
  }
  // Ledger amounts are signed (payouts/advances negative); outflow shown positive.
  for (const g of ledger) {
    const m = bucket(g.fundAccountId!, monthOf.get(g.periodId));
    if (m) m.ownerPaymentsPaisa -= Number(g._sum.amountPaisa ?? 0);
  }
  // Movements carry their effect on the loan outstanding; cash moves the other way.
  for (const g of moves) {
    const m = bucket(g.fundAccountId, monthOf.get(g.periodId));
    if (m) m.loanRepaymentsPaisa -= Number(g._sum.amountPaisa ?? 0);
  }
  for (const l of loans) {
    const m = bucket(l.fundAccountId, monthKey(l.disbursedOn));
    if (m) m.loansOutPaisa += Number(l.principalPaisa);
  }

  const rows = funds
    .filter((f) => f.isActive || buckets.get(f.id)?.touched)
    .map((f) => {
      const b = buckets.get(f.id);
      // The opening balance exists from the account's opening month on (no earlier report shows it).
      const opening = monthKey(f.openingDate) <= end ? Number(f.openingBalancePaisa) : 0;
      return { fundAccountId: f.id, name: f.name, type: f.type, isActive: f.isActive, ...fundRow(opening, b?.before ?? empty(), b?.within ?? empty()) };
    });
  const sum = (k: keyof FundsReportDto["totals"]) => rows.reduce((s, r) => s + r[k], 0);
  return {
    house,
    period: range,
    rows,
    totals: {
      openingPaisa: sum("openingPaisa"),
      incomePaisa: sum("incomePaisa"),
      expensesPaisa: sum("expensesPaisa"),
      ownerPaymentsPaisa: sum("ownerPaymentsPaisa"),
      loansOutPaisa: sum("loansOutPaisa"),
      loanRepaymentsPaisa: sum("loanRepaymentsPaisa"),
      closingPaisa: sum("closingPaisa"),
    },
    months: [...periods].reverse().map((p) => ({ key: p.key, status: p.status })),
    years: yearsOf(periods),
  };
}
