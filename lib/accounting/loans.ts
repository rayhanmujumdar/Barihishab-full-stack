// Pure loan and advance formulas (Advances & Loans PRD §7). Money is integer
// paisa; months are "YYYY-MM" keys. Services fetch rows and call these —
// outstanding, repaid and statuses are never stored.
import type { LedgerType } from "./owners";

export type LoanStatus = "ACTIVE" | "REPAID" | "WRITTEN_OFF" | "CANCELLED";
export type EntryOrigin = "DIRECT" | "CLOSE" | "PAYOUT_SPLIT";
export type LoanMovementType = "CASH_REPAYMENT" | "REVERSAL" | "CANCELLATION" | "WRITE_OFF";

type Signed = { amountPaisa: number; voided: boolean };
/** Owner-ledger rows linked to a loan: LOAN_DEDUCTION (−) and their REVERSALs (+). */
type LedgerSide = Signed & { type: "LOAN_DEDUCTION" | "REVERSAL" };
/** Loan movements: signed effect on the outstanding. */
type MovementSide = Signed & { type: LoanMovementType };

export type LoanFigures = { outstandingPaisa: number; repaidCashPaisa: number; repaidDeductionPaisa: number; repaidPaisa: number; progress: number };

/** §7.1: outstanding = principal + Σ linked ledger + Σ movements; repaid counts non-voided repayments only. */
export function loanFigures(principalPaisa: number, ledger: readonly LedgerSide[], movements: readonly MovementSide[]): LoanFigures {
  const sum = (rows: readonly Signed[]) => rows.reduce((s, r) => s + r.amountPaisa, 0);
  const repaidCashPaisa = 0 - sum(movements.filter((m) => m.type === "CASH_REPAYMENT" && !m.voided));
  const repaidDeductionPaisa = 0 - sum(ledger.filter((l) => l.type === "LOAN_DEDUCTION" && !l.voided));
  const repaidPaisa = repaidCashPaisa + repaidDeductionPaisa;
  return {
    outstandingPaisa: principalPaisa + sum(ledger) + sum(movements),
    repaidCashPaisa,
    repaidDeductionPaisa,
    repaidPaisa,
    progress: repaidPaisa / principalPaisa,
  };
}

/** "2026-12" + 1 → "2027-01" */
function addMonth(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export type Schedule = { monthsLeft: number; finishMonth: string; nextDeduction: { amountPaisa: number; month: string } };

/**
 * §7.2: instalments start with the close of the month after disbursement (or
 * the earliest open month if later); finish = first + ⌈outstanding ÷ instalment⌉ − 1.
 */
export function expectedFinish(loan: {
  status: LoanStatus;
  outstandingPaisa: number;
  installmentPaisa: number | null;
  disbursedOn: string;
  earliestOpenMonth: string | null;
}): Schedule | null {
  const instalment = loan.installmentPaisa ?? 0;
  if (loan.status !== "ACTIVE" || instalment <= 0 || loan.outstandingPaisa <= 0) return null;
  const afterDisbursement = addMonth(loan.disbursedOn.slice(0, 7), 1);
  const first = loan.earliestOpenMonth && loan.earliestOpenMonth > afterDisbursement ? loan.earliestOpenMonth : afterDisbursement;
  const monthsLeft = Math.ceil(loan.outstandingPaisa / instalment);
  return { monthsLeft, finishMonth: addMonth(first, monthsLeft - 1), nextDeduction: { amountPaisa: Math.min(instalment, loan.outstandingPaisa), month: first } };
}

/** §7.4, G1, G2: the most a repayment may be. */
export function repaymentCap(mode: "CASH" | "DEDUCTION", outstandingPaisa: number, ownerBalancePaisa: number): number {
  return mode === "CASH" ? outstandingPaisa : Math.min(outstandingPaisa, Math.max(0, ownerBalancePaisa));
}

// ─── Movement history (F3) ───

type Row = { id: string; date: string; at: string; voided: boolean; voidReason: string | null; reversesId: string | null; recordedBy: string; note: string | null };
export type HistoryLedgerRow = Row & { type: "LOAN_DEDUCTION" | "REVERSAL"; amountPaisa: number; origin: EntryOrigin };
export type HistoryMovementRow = Row & { type: LoanMovementType; amountPaisa: number };

export type HistoryKind = "DISBURSED" | "CASH_REPAYMENT" | "DEDUCTION" | "REVERSAL" | "CANCELLED" | "WRITTEN_OFF" | "SKIPPED";
export type HistoryRow = {
  id: string;
  kind: HistoryKind;
  source: "LOAN" | "LEDGER" | "MOVEMENT" | "SNAPSHOT";
  date: string;
  month: string;
  amountPaisa: number;
  effectPaisa: number;
  runningPaisa: number;
  onClose: boolean;
  voided: boolean;
  voidReason: string | null;
  voidable: boolean;
  reversesId: string | null;
  recordedBy: string | null;
  note: string | null;
};

const MOVEMENT_KIND: Record<LoanMovementType, HistoryKind> = { CASH_REPAYMENT: "CASH_REPAYMENT", REVERSAL: "REVERSAL", CANCELLATION: "CANCELLED", WRITE_OFF: "WRITTEN_OFF" };

/** Every movement oldest first with the running outstanding; voided rows stay with their reversals. */
export function loanHistory(input: {
  status: LoanStatus;
  principalPaisa: number;
  disbursedOn: string;
  disbursedAt: string;
  disbursedBy: string;
  ledger: readonly HistoryLedgerRow[];
  movements: readonly HistoryMovementRow[];
  skippedMonths: readonly { month: string; date: string }[];
}): HistoryRow[] {
  const open = input.status === "ACTIVE" || input.status === "REPAID";
  type Draft = Omit<HistoryRow, "runningPaisa"> & { at: string };
  const common = (r: Row) => ({ id: r.id, date: r.date, month: r.date.slice(0, 7), at: r.at, voided: r.voided, voidReason: r.voidReason, reversesId: r.reversesId, recordedBy: r.recordedBy, note: r.note });
  const drafts: Draft[] = [
    {
      id: "disbursed",
      kind: "DISBURSED",
      source: "LOAN",
      date: input.disbursedOn,
      month: input.disbursedOn.slice(0, 7),
      at: "",
      amountPaisa: input.principalPaisa,
      effectPaisa: input.principalPaisa,
      onClose: false,
      voided: false,
      voidReason: null,
      voidable: false,
      reversesId: null,
      recordedBy: input.disbursedBy,
      note: null,
    },
    ...input.ledger.map((l): Draft => ({
      ...common(l),
      kind: l.type === "LOAN_DEDUCTION" ? "DEDUCTION" : "REVERSAL",
      source: "LEDGER",
      amountPaisa: Math.abs(l.amountPaisa),
      effectPaisa: l.amountPaisa,
      onClose: l.origin === "CLOSE",
      voidable: open && l.type === "LOAN_DEDUCTION" && l.origin !== "CLOSE" && !l.voided,
    })),
    ...input.movements.map((m): Draft => ({
      ...common(m),
      kind: MOVEMENT_KIND[m.type],
      source: "MOVEMENT",
      amountPaisa: Math.abs(m.amountPaisa),
      effectPaisa: m.amountPaisa,
      onClose: false,
      voidable: open && m.type === "CASH_REPAYMENT" && !m.voided,
    })),
    ...input.skippedMonths.map((s): Draft => ({
      id: `skipped-${s.month}`,
      kind: "SKIPPED",
      source: "SNAPSHOT",
      date: s.date,
      month: s.month,
      at: "~",
      amountPaisa: 0,
      effectPaisa: 0,
      onClose: true,
      voided: false,
      voidReason: null,
      voidable: false,
      reversesId: null,
      recordedBy: null,
      note: null,
    })),
  ];
  drafts.sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at));
  let running = 0;
  return drafts.map(({ at: _at, ...d }) => {
    running += d.effectPaisa;
    return { ...d, runningPaisa: running };
  });
}

// ─── Advance recovery (§7.6) ───

export type AdvanceStatus = { status: "OUTSTANDING" | "RECOVERED" | "VOID"; recoveredMonth: string | null };

/**
 * Entries in posting order. Debits that take the balance below 0 queue their
 * below-zero part (advances by id); credits clear the queue oldest first. An
 * advance is recovered in the month of the entry that clears it.
 */
export function advanceStatuses(entries: readonly { id: string; type: LedgerType; amountPaisa: number; month: string; voided: boolean }[]): Map<string, AdvanceStatus> {
  const out = new Map<string, AdvanceStatus>();
  const queue: { id: string | null; left: number }[] = [];
  let balance = 0;
  for (const e of entries) {
    if (e.voided) {
      if (e.type === "ADVANCE") out.set(e.id, { status: "VOID", recoveredMonth: null });
      continue;
    }
    if (e.type === "REVERSAL") continue;
    const deficitBefore = Math.max(0, -balance);
    balance += e.amountPaisa;
    const deficitAfter = Math.max(0, -balance);
    if (deficitAfter > deficitBefore) queue.push({ id: e.type === "ADVANCE" ? e.id : null, left: deficitAfter - deficitBefore });
    else if (e.type === "ADVANCE") out.set(e.id, { status: "RECOVERED", recoveredMonth: e.month });
    let cleared = deficitBefore - deficitAfter;
    while (cleared > 0) {
      const head = queue[0];
      const take = Math.min(head.left, cleared);
      head.left -= take;
      cleared -= take;
      if (head.left === 0) {
        queue.shift();
        if (head.id) out.set(head.id, { status: "RECOVERED", recoveredMonth: e.month });
      }
    }
  }
  for (const q of queue) if (q.id) out.set(q.id, { status: "OUTSTANDING", recoveredMonth: null });
  return out;
}
