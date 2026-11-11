// Pure report formulas (Reports PRD §3, §7). Money is integer paisa; months
// are "YYYY-MM" keys. Services fetch rows and call these; reports never write.
import { sharePercent, totalUnits, unitsIn, type LedgerType, type ShareSetLike } from "./owners";

const TEN_K = BigInt(10_000);
const TWO = BigInt(2);
const ZERO = BigInt(0);

/** amount / total in basis points, half-up; 0 when total ≤ 0 (G5). BigInt keeps it exact. */
export function shareBp(amountPaisa: number, totalPaisa: number): number {
  if (totalPaisa <= 0) return 0;
  const t = BigInt(totalPaisa);
  return Number((BigInt(amountPaisa) * TEN_K * TWO + t) / (TWO * t));
}

/** (now − before) / |before| in basis points, half away from zero; null without a base (F8). */
export function changeBp(nowPaisa: number, beforePaisa: number | null): number | null {
  if (!beforePaisa) return null;
  const diff = BigInt(nowPaisa - beforePaisa) * TEN_K * TWO;
  const base = BigInt(Math.abs(beforePaisa));
  const neg = diff < ZERO;
  const q = ((neg ? -diff : diff) + base) / (TWO * base);
  return Number(neg ? -q : q);
}

// ─── Category breakdown (F2.3–F2.4) ───

export type CategoryGroup = { categoryId: string; code: string; nameEn: string; nameBn: string; sortOrder: number; amountPaisa: number; count: number };

/** Drops empty categories; expenses largest first (ties by category order), income by category order. */
export function categoryRows<T extends CategoryGroup>(groups: readonly T[], kind: "INCOME" | "EXPENSE"): (T & { shareBp: number })[] {
  const rows = groups.filter((g) => g.count > 0);
  const total = rows.reduce((s, g) => s + g.amountPaisa, 0);
  rows.sort((a, b) => (kind === "EXPENSE" && b.amountPaisa !== a.amountPaisa ? b.amountPaisa - a.amountPaisa : a.sortOrder - b.sortOrder));
  return rows.map((g) => ({ ...g, shareBp: shareBp(g.amountPaisa, total) }));
}

// ─── Month figures (G1, Rule 4) ───

/** Staircase as stored in a snapshot or computed live; `expensePaisa` = expenses counted. */
export type StairLike = {
  incomePaisa: number;
  expensePaisa: number;
  reserveSpentPaisa: number;
  reservePaisa: number;
  previousDeficitPaisa: number;
  distributablePaisa: number;
  deficitCarriedPaisa: number;
};

export type MonthFigure = {
  incomePaisa: number;
  /** Every non-voided expense, Reserve-paid included. */
  expensesAllPaisa: number;
  fromReservePaisa: number;
  /** Expenses (all) − paid from Reserve: the only part that cuts the distributable. */
  expensesCountedPaisa: number;
  reservePaisa: number;
  previousDeficitPaisa: number;
  distributablePaisa: number;
  deficitCarriedPaisa: number;
};

export function monthFigure(s: StairLike): MonthFigure {
  return {
    incomePaisa: s.incomePaisa,
    expensesAllPaisa: s.expensePaisa + s.reserveSpentPaisa,
    fromReservePaisa: s.reserveSpentPaisa,
    expensesCountedPaisa: s.expensePaisa,
    reservePaisa: s.reservePaisa,
    previousDeficitPaisa: s.previousDeficitPaisa,
    distributablePaisa: s.distributablePaisa,
    deficitCarriedPaisa: s.deficitCarriedPaisa,
  };
}

// ─── Yearly totals (G2, Rule 5) ───

export type ReportStatus = "FINAL" | "DRAFT" | "NONE";
export type YearColumn = { month: string; status: ReportStatus; figure: MonthFigure | null };
export type YearSums = { incomePaisa: number; expensesAllPaisa: number; fromReservePaisa: number; reservePaisa: number; distributablePaisa: number };

const zeroSums = (): YearSums => ({ incomePaisa: 0, expensesAllPaisa: 0, fromReservePaisa: 0, reservePaisa: 0, distributablePaisa: 0 });

function addTo(sums: YearSums, f: MonthFigure) {
  sums.incomePaisa += f.incomePaisa;
  sums.expensesAllPaisa += f.expensesAllPaisa;
  sums.fromReservePaisa += f.fromReservePaisa;
  sums.reservePaisa += f.reservePaisa;
  sums.distributablePaisa += f.distributablePaisa;
}

/** Closed months are the main figure; draft months are reported beside them. */
export function yearTotals(columns: readonly YearColumn[]): { closed: YearSums; draft: YearSums; closedCount: number; draftCount: number } {
  const closed = zeroSums();
  const draft = zeroSums();
  let closedCount = 0;
  let draftCount = 0;
  for (const c of columns) {
    if (!c.figure) continue;
    if (c.status === "FINAL") {
      addTo(closed, c.figure);
      closedCount++;
    } else {
      addTo(draft, c.figure);
      draftCount++;
    }
  }
  return { closed, draft, closedCount, draftCount };
}

// ─── Owner year table (F3.6, Rules 6–7) ───

export type YearLedgerEntry = { ownerId: string; type: LedgerType; amountPaisa: number; reversedType?: LedgerType | null };
export type OwnerYearFigures = {
  openingPaisa: number;
  entitlementPaisa: number;
  paidOutPaisa: number;
  advancesPaisa: number;
  loanDeductionPaisa: number;
  otherPaisa: number;
  /** opening + entitlement − paid out − advances − loan deductions + other. */
  endPaisa: number;
};

/**
 * Sums an owner's ledger rows booked to the year by type. A reversal counts
 * against the type it reverses (unknown → other); OPENING rows booked inside
 * the year join the opening. Outflows are shown positive.
 */
export function ownerYearFigures(ownerIds: readonly string[], before: ReadonlyMap<string, number>, entries: readonly YearLedgerEntry[]): Map<string, OwnerYearFigures> {
  const out = new Map<string, OwnerYearFigures>();
  for (const id of ownerIds) {
    const opening = before.get(id) ?? 0;
    out.set(id, { openingPaisa: opening, entitlementPaisa: 0, paidOutPaisa: 0, advancesPaisa: 0, loanDeductionPaisa: 0, otherPaisa: 0, endPaisa: opening });
  }
  for (const e of entries) {
    const f = out.get(e.ownerId);
    if (!f) continue;
    const type = e.type === "REVERSAL" ? (e.reversedType ?? "ADJUSTMENT") : e.type;
    const a = e.amountPaisa;
    f.endPaisa += a;
    if (type === "OPENING") f.openingPaisa += a;
    else if (type === "ENTITLEMENT") f.entitlementPaisa += a;
    else if (type === "PAYOUT") f.paidOutPaisa -= a;
    else if (type === "ADVANCE") f.advancesPaisa -= a;
    else if (type === "LOAN_DEDUCTION") f.loanDeductionPaisa -= a;
    else f.otherPaisa += a;
  }
  return out;
}

export type ShareChange = { month: string; unitsBefore: number; unitsAfter: number; percentBefore: number; percentAfter: number };

/** Share changes for one owner taking effect inside `year` (G8); the house's first set is not a change. */
export function shareChanges(sets: readonly ShareSetLike[], year: number, ownerId: string): ShareChange[] {
  const active = sets.filter((s) => !s.replaced).sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth));
  const out: ShareChange[] = [];
  for (let i = 1; i < active.length; i++) {
    const prev = active[i - 1];
    const set = active[i];
    if (!set.effectiveMonth.startsWith(`${year}-`)) continue;
    const unitsBefore = unitsIn(prev, ownerId);
    const unitsAfter = unitsIn(set, ownerId);
    const percentBefore = sharePercent(unitsBefore, totalUnits(prev));
    const percentAfter = sharePercent(unitsAfter, totalUnits(set));
    if (unitsBefore !== unitsAfter || percentBefore !== percentAfter) out.push({ month: set.effectiveMonth, unitsBefore, unitsAfter, percentBefore, percentAfter });
  }
  return out;
}

// ─── Rent roll (F9) ───

/** `addedIn` = month the unit was created; there are no start/end dates, so the rent itself bounds the window. */
export type RentUnit = { id: string; name: string; tenantName: string | null; rentPaisa: number; isActive: boolean; addedIn?: string | null };
export type RentIncome = { id: string; unitId: string; month: string; referenceMonth: string | null; amountPaisa: number };
export type RentCell =
  | { kind: "PAID"; amountPaisa: number; entryIds: string[] }
  | { kind: "ARREAR"; paidIn: string; amountPaisa: number; entryIds: string[] }
  | { kind: "NONE" };
export type RentRollRow = { unitId: string; name: string; tenantName: string | null; cells: RentCell[]; totalPaisa: number; expectedPaisa: number };
export type RentRollMonth = { key: string; totalPaisa: number; expectedPaisa: number | null; collectionBp: number | null };

/** The month a rent entry pays for: its reference month (arrears), else the month it is booked to. */
const rentMonthOf = (i: RentIncome) => i.referenceMonth ?? i.month;

/**
 * Units × months, each cell about that month's own rent: PAID when it was
 * booked in the month, ARREAR (with the month it was paid in) when it was
 * booked later, else NONE — a catch-up payment never marks its booking month
 * paid. Totals and collection count each month's rent however late it came.
 * Inactive units appear only when they have rent in the year; a unit is
 * expected to pay from the month it was added (or first paid) and, once
 * inactive, only up to its last rent.
 */
export function rentRoll(units: readonly RentUnit[], months: readonly { key: string; hasPeriod: boolean }[], incomes: readonly RentIncome[]): { rows: RentRollRow[]; months: RentRollMonth[] } {
  const inGrid = new Set(months.map((m) => m.key));
  const forGrid = incomes.filter((i) => inGrid.has(rentMonthOf(i)));
  const withRent = new Set(forGrid.map((i) => i.unitId));
  const shown = units.filter((u) => u.isActive || withRent.has(u.id));
  const sum = (list: readonly RentIncome[]) => list.reduce((s, i) => s + i.amountPaisa, 0);
  // Months each unit is expected to pay: from when it was added (or first paid,
  // if earlier) and, for an inactive unit, up to its last rent.
  const expectedIn = new Map(
    units.map((u) => {
      const paid = forGrid.filter((i) => i.unitId === u.id).map(rentMonthOf).sort();
      const from = [u.addedIn, paid[0]].filter((x): x is string => !!x).sort()[0] ?? null;
      const to = u.isActive ? null : (paid.at(-1) ?? "");
      return [u.id, (key: string) => (from === null || key >= from) && (to === null || key <= to)] as const;
    }),
  );
  const expects = (u: RentUnit, m: { key: string; hasPeriod: boolean }) => m.hasPeriod && expectedIn.get(u.id)!(m.key);
  const rows = shown.map((u): RentRollRow => {
    const mine = forGrid.filter((i) => i.unitId === u.id);
    const cells = months.map((m): RentCell => {
      const forMonth = mine.filter((i) => rentMonthOf(i) === m.key);
      const onTime = forMonth.filter((i) => i.month <= m.key);
      if (onTime.length) return { kind: "PAID", amountPaisa: sum(onTime), entryIds: onTime.map((i) => i.id) };
      const late = [...forMonth].sort((a, b) => a.month.localeCompare(b.month));
      return late.length ? { kind: "ARREAR", paidIn: late[0].month, amountPaisa: sum(late), entryIds: late.map((i) => i.id) } : { kind: "NONE" };
    });
    const totalPaisa = cells.reduce((s, c) => s + (c.kind === "NONE" ? 0 : c.amountPaisa), 0);
    return { unitId: u.id, name: u.name, tenantName: u.tenantName, cells, totalPaisa, expectedPaisa: u.rentPaisa * months.filter((m) => expects(u, m)).length };
  });
  const monthRows = months.map((m, i): RentRollMonth => {
    const totalPaisa = rows.reduce((s, r) => {
      const c = r.cells[i];
      return s + (c.kind === "NONE" ? 0 : c.amountPaisa);
    }, 0);
    if (!m.hasPeriod) return { key: m.key, totalPaisa, expectedPaisa: null, collectionBp: null };
    const expected = units.filter((u) => expects(u, m)).reduce((s, u) => s + u.rentPaisa, 0);
    return { key: m.key, totalPaisa, expectedPaisa: expected, collectionBp: expected > 0 ? shareBp(totalPaisa, expected) : null };
  });
  return { rows, months: monthRows };
}

// ─── Fund accounts (F11) ───

/** Cash moves of one account over a stretch of months; outflows positive. */
export type FundMoves = { incomePaisa: number; expensesPaisa: number; ownerPaymentsPaisa: number; loansOutPaisa: number; loanRepaymentsPaisa: number };
export type FundRow = FundMoves & { openingPaisa: number; closingPaisa: number };

const net = (m: FundMoves) => m.incomePaisa - m.expensesPaisa - m.ownerPaymentsPaisa - m.loansOutPaisa + m.loanRepaymentsPaisa;

/** Opening = account opening + everything before the period; closing = opening + the period's moves. */
export function fundRow(accountOpeningPaisa: number, before: FundMoves, within: FundMoves): FundRow {
  const openingPaisa = accountOpeningPaisa + net(before);
  return { openingPaisa, ...within, closingPaisa: openingPaisa + net(within) };
}
