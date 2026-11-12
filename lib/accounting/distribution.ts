// Pure Distribution formulas (Distribution PRD §7; main PRD §5.2–5.3, §5.5).
// Money is integer paisa; services fetch rows and call these. The same code
// computes an open month's preview and the values posted on close, so the
// two can never drift.
import type { LedgerType } from "./owners";

// ─── Reserve and staircase (§7.1) ───

// tsconfig targets < ES2020, so no BigInt literals.
const ZERO = BigInt(0);
const ONE = BigInt(1);
const HALF_TAKA = BigInt(500_000);
const TAKA_SCALE = BigInt(1_000_000);

export type ReserveRule = { mode: "OFF" } | { mode: "PERCENT"; percentBp: number } | { mode: "FIXED"; fixedPaisa: number };

/**
 * Reserve held back this month: nothing without a surplus (Rule 10); the
 * month override replaces the rule; Percent is rounded half-up to whole taka;
 * Fixed and the override never exceed the surplus.
 */
export function reserveFor(surplusPaisa: number, rule: ReserveRule, overridePaisa: number | null = null): number {
  if (surplusPaisa <= 0) return 0;
  if (overridePaisa !== null) return Math.min(overridePaisa, surplusPaisa);
  if (rule.mode === "FIXED") return Math.min(rule.fixedPaisa, surplusPaisa);
  if (rule.mode === "PERCENT") {
    // surplus × bp / 10000 = paisa; / 100 = taka; +0.5 taka → half-up.
    const taka = (BigInt(surplusPaisa) * BigInt(rule.percentBp) + HALF_TAKA) / TAKA_SCALE;
    return Math.min(Number(taka) * 100, surplusPaisa);
  }
  return 0;
}

export type StaircaseInput = {
  incomePaisa: number;
  /** Expenses not paid from the Reserve. */
  expensePaisa: number;
  reserveSpentPaisa: number;
  previousDeficitPaisa: number;
  rule: ReserveRule;
  overridePaisa?: number | null;
};

export type Staircase = {
  incomePaisa: number;
  expensePaisa: number;
  reserveSpentPaisa: number;
  surplusPaisa: number;
  reservePaisa: number;
  reserveSource: "RULE" | "OVERRIDE";
  previousDeficitPaisa: number;
  netPaisa: number;
  distributablePaisa: number;
  deficitCarriedPaisa: number;
};

/** Income − Expense − Reserve − Previous deficit = Distributable, never below 0 (F2, F10). */
export function staircase(i: StaircaseInput): Staircase {
  const override = i.overridePaisa ?? null;
  const surplusPaisa = i.incomePaisa - i.expensePaisa;
  const reservePaisa = reserveFor(surplusPaisa, i.rule, override);
  const netPaisa = surplusPaisa - reservePaisa - i.previousDeficitPaisa;
  return {
    incomePaisa: i.incomePaisa,
    expensePaisa: i.expensePaisa,
    reserveSpentPaisa: i.reserveSpentPaisa,
    surplusPaisa,
    reservePaisa,
    reserveSource: override !== null && surplusPaisa > 0 ? "OVERRIDE" : "RULE",
    previousDeficitPaisa: i.previousDeficitPaisa,
    netPaisa,
    distributablePaisa: Math.max(0, netPaisa),
    deficitCarriedPaisa: Math.max(0, -netPaisa),
  };
}

// ─── Entitlements (§7.2) ───

export type Holder = { ownerId: string; units: number };
export type Allocation = { ownerId: string; amountPaisa: number };

/**
 * Largest-remainder split in paisa: floor every share, then hand the leftover
 * paisa to the largest remainders, ties by display order (the input order).
 * Σ result = distributable exactly. 0-unit holders get 0.
 */
export function allocate(distributablePaisa: number, holders: readonly Holder[]): Allocation[] {
  const total = BigInt(holders.reduce((s, h) => s + Math.max(h.units, 0), 0));
  if (total === ZERO || distributablePaisa <= 0) return holders.map((h) => ({ ownerId: h.ownerId, amountPaisa: 0 }));
  const parts = holders.map((h, index) => {
    const product = BigInt(distributablePaisa) * BigInt(Math.max(h.units, 0));
    return { ownerId: h.ownerId, index, units: h.units, floor: product / total, rem: product % total };
  });
  let leftover = BigInt(distributablePaisa) - parts.reduce((s, p) => s + p.floor, ZERO);
  const order = parts.filter((p) => p.units > 0).sort((a, b) => (a.rem === b.rem ? a.index - b.index : a.rem > b.rem ? -1 : 1));
  for (const p of order) {
    if (leftover === ZERO) break;
    p.floor += ONE;
    leftover -= ONE;
  }
  return parts.map((p) => ({ ownerId: p.ownerId, amountPaisa: Number(p.floor) }));
}

// ─── Loan instalments (§7.5) ───

export type LoanForClose = { id: string; ownerId: string; installmentPaisa: number | null; outstandingPaisa: number; disbursedOn: string };
export type LoanDeduction = { loanId: string; ownerId: string; amountPaisa: number; paysOff: boolean };

/**
 * For each loan with an instalment (oldest first): deduct min(instalment,
 * outstanding, entitlement still free). Nothing free → skipped (G4).
 */
export function loanDeductions(
  entitlements: readonly Allocation[],
  loans: readonly LoanForClose[],
  month?: string,
): { deductions: LoanDeduction[]; skipped: { loanId: string; ownerId: string }[] } {
  const free = new Map(entitlements.map((e) => [e.ownerId, e.amountPaisa]));
  const deductions: LoanDeduction[] = [];
  const skipped: { loanId: string; ownerId: string }[] = [];
  const due = loans
    // §7.3: the first instalment is taken the month after disbursement.
    .filter((l) => (l.installmentPaisa ?? 0) > 0 && l.outstandingPaisa > 0 && (!month || l.disbursedOn < `${month}-01`))
    .sort((a, b) => a.disbursedOn.localeCompare(b.disbursedOn) || a.id.localeCompare(b.id));
  for (const loan of due) {
    const available = free.get(loan.ownerId) ?? 0;
    const amountPaisa = Math.min(loan.installmentPaisa!, loan.outstandingPaisa, available);
    if (amountPaisa <= 0) {
      skipped.push({ loanId: loan.id, ownerId: loan.ownerId });
      continue;
    }
    free.set(loan.ownerId, available - amountPaisa);
    deductions.push({ loanId: loan.id, ownerId: loan.ownerId, amountPaisa, paysOff: amountPaisa === loan.outstandingPaisa });
  }
  return { deductions, skipped };
}

/** Σ deduction per owner. */
export function deductionByOwner(deductions: readonly LoanDeduction[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of deductions) m.set(d.ownerId, (m.get(d.ownerId) ?? 0) + d.amountPaisa);
  return m;
}

// ─── Owner board (§7.3) ───

export type BoardEntry = { id: string; ownerId: string; type: LedgerType; amountPaisa: number; reversesId: string | null; voided: boolean };

export type BoardOwnerInput = {
  ownerId: string;
  units: number;
  /** Σ entries of earlier months. */
  openingPaisa: number;
  /** Σ of every entry (any month) — "Balance now" for an open month. */
  currentBalancePaisa: number;
  loanOutstandingPaisa: number;
};

export type BoardRow = {
  ownerId: string;
  units: number;
  openingPaisa: number;
  entitlementPaisa: number;
  receivedPaisa: number;
  advancePaisa: number;
  loanDeductionPaisa: number;
  otherPaisa: number;
  balancePaisa: number;
  afterClosePaisa: number | null;
  loanOutstandingPaisa: number;
};

export type BoardTotals = { entitlementPaisa: number; receivedPaisa: number; advancePaisa: number; loanDeductionPaisa: number; otherPaisa: number };

/**
 * Board rows in input (display) order for owners with units or any entry in
 * the month (G8). A voided original and its reversal in the same month cancel;
 * other reversals, openings and adjustments are "Other" (G10). Open months
 * use the preview entitlement / deduction and the current balance; closed
 * months the posted values and the month-end balance.
 */
export function boardRows(input: {
  status: "OPEN" | "CLOSED";
  owners: readonly BoardOwnerInput[];
  monthEntries: readonly BoardEntry[];
  entitlements: ReadonlyMap<string, number>;
  deductions: ReadonlyMap<string, number>;
}): { rows: BoardRow[]; totals: BoardTotals } {
  const inMonth = new Set(input.monthEntries.map((e) => e.id));
  const reversedInMonth = new Set(input.monthEntries.filter((e) => e.type === "REVERSAL" && e.reversesId && inMonth.has(e.reversesId)).map((e) => e.reversesId!));
  const open = input.status === "OPEN";
  const rows: BoardRow[] = [];
  for (const o of input.owners) {
    const mine = input.monthEntries.filter((e) => e.ownerId === o.ownerId);
    if (o.units <= 0 && mine.length === 0) continue;
    const row: BoardRow = {
      ownerId: o.ownerId,
      units: o.units,
      openingPaisa: o.openingPaisa,
      entitlementPaisa: 0,
      receivedPaisa: 0,
      advancePaisa: 0,
      loanDeductionPaisa: 0,
      otherPaisa: 0,
      balancePaisa: o.openingPaisa,
      afterClosePaisa: null,
      loanOutstandingPaisa: o.loanOutstandingPaisa,
    };
    for (const e of mine) {
      row.balancePaisa += e.amountPaisa;
      const cancelled = reversedInMonth.has(e.id) || (e.type === "REVERSAL" && e.reversesId !== null && reversedInMonth.has(e.reversesId));
      if (cancelled) continue;
      if (e.type === "ENTITLEMENT") row.entitlementPaisa += e.amountPaisa;
      else if (e.type === "PAYOUT") row.receivedPaisa -= e.amountPaisa;
      else if (e.type === "ADVANCE") row.advancePaisa -= e.amountPaisa;
      else if (e.type === "LOAN_DEDUCTION") row.loanDeductionPaisa -= e.amountPaisa;
      else row.otherPaisa += e.amountPaisa;
    }
    if (open) {
      row.entitlementPaisa = input.entitlements.get(o.ownerId) ?? 0;
      row.loanDeductionPaisa = input.deductions.get(o.ownerId) ?? 0;
      row.balancePaisa = o.currentBalancePaisa;
      row.afterClosePaisa = o.currentBalancePaisa + row.entitlementPaisa - row.loanDeductionPaisa;
    }
    rows.push(row);
  }
  const totals: BoardTotals = { entitlementPaisa: 0, receivedPaisa: 0, advancePaisa: 0, loanDeductionPaisa: 0, otherPaisa: 0 };
  for (const r of rows) {
    totals.entitlementPaisa += r.entitlementPaisa;
    totals.receivedPaisa += r.receivedPaisa;
    totals.advancePaisa += r.advancePaisa;
    totals.loanDeductionPaisa += r.loanDeductionPaisa;
    totals.otherPaisa += r.otherPaisa;
  }
  return { rows, totals };
}

// ─── Close checklist (F5, G1, G2) ───

export type UnitLike = { id: string; name: string; tenantName: string | null; rentPaisa: number; isActive: boolean };

/** Active units with rent and no income entry this month. */
export function unpaidUnits<T extends UnitLike>(units: readonly T[], paidUnitIds: ReadonlySet<string>): T[] {
  return units.filter((u) => u.isActive && u.rentPaisa > 0 && !paidUnitIds.has(u.id));
}

export type MustPassCode = "SHARES" | "PREVIOUS_CLOSED" | "BALANCED" | "STILL_OPEN";
export type WarningCode = "NO_INCOME" | "UNPAID_RENT" | "MISSING_BILLS" | "MONTH_NOT_OVER" | "RESERVE_NEGATIVE" | "OPEN_COMPLAINTS";

export type CloseCheckInput = {
  totalUnits: number;
  ownersWithUnits: number;
  previousOpenMonth: string | null;
  sumEntitlementsPaisa: number;
  distributablePaisa: number;
  isOpen: boolean;
  incomeCount: number;
  unpaidUnitCount: number;
  expensesWithoutBill: number;
  monthOver: boolean;
  reserveAfterClosePaisa: number;
  /** Open / In review complaints about this month (Notices & Complaints C8, Rule 15): a warning, never a block. */
  openComplaints: number;
};

export function closeChecks(i: CloseCheckInput): {
  mustPass: { code: MustPassCode; ok: boolean }[];
  warnings: WarningCode[];
  canClose: boolean;
} {
  const shares = i.totalUnits > 0 && i.ownersWithUnits > 0;
  const mustPass: { code: MustPassCode; ok: boolean }[] = [
    { code: "SHARES", ok: shares },
    { code: "PREVIOUS_CLOSED", ok: i.previousOpenMonth === null },
    // Without shares nothing can be split; that is the SHARES failure, not a mismatch.
    { code: "BALANCED", ok: !shares || i.sumEntitlementsPaisa === i.distributablePaisa },
    { code: "STILL_OPEN", ok: i.isOpen },
  ];
  const warnings: WarningCode[] = [];
  if (i.incomeCount === 0) warnings.push("NO_INCOME");
  if (i.unpaidUnitCount > 0) warnings.push("UNPAID_RENT");
  if (i.expensesWithoutBill > 0) warnings.push("MISSING_BILLS");
  if (!i.monthOver) warnings.push("MONTH_NOT_OVER");
  if (i.reserveAfterClosePaisa < 0) warnings.push("RESERVE_NEGATIVE");
  if (i.openComplaints > 0) warnings.push("OPEN_COMPLAINTS");
  return { mustPass, warnings, canClose: mustPass.every((c) => c.ok) };
}

// ─── Before → after (F8, G6) ───

export type SnapshotFigures = {
  incomePaisa: number;
  expensePaisa: number;
  reservePaisa: number;
  previousDeficitPaisa: number;
  distributablePaisa: number;
  deficitCarriedPaisa: number;
  entitlements: readonly Allocation[];
};

export const STAIRCASE_LINES = ["incomePaisa", "expensePaisa", "reservePaisa", "previousDeficitPaisa", "distributablePaisa", "deficitCarriedPaisa"] as const;
export type StaircaseLine = (typeof STAIRCASE_LINES)[number];

/** Changed staircase lines + every owner's old → new entitlement, in `after` then `before` order. */
export function diffSnapshots(before: SnapshotFigures, after: SnapshotFigures) {
  const lines = STAIRCASE_LINES.filter((k) => before[k] !== after[k]).map((key) => ({ key, beforePaisa: before[key], afterPaisa: after[key], diffPaisa: after[key] - before[key] }));
  const old = new Map(before.entitlements.map((e) => [e.ownerId, e.amountPaisa]));
  const ids = [...new Set([...after.entitlements.map((e) => e.ownerId), ...before.entitlements.map((e) => e.ownerId)])];
  const now = new Map(after.entitlements.map((e) => [e.ownerId, e.amountPaisa]));
  const owners = ids.map((ownerId) => {
    const beforePaisa = old.get(ownerId) ?? 0;
    const afterPaisa = now.get(ownerId) ?? 0;
    return { ownerId, beforePaisa, afterPaisa, diffPaisa: afterPaisa - beforePaisa };
  });
  return { lines, owners };
}
