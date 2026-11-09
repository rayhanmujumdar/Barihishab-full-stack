// Pure business rules for an income/expense entry (Income & Expenses PRD
// §3.7, §8). Services resolve the referenced rows; this decides validity.
import { NON_MANUAL_CODES } from "@/lib/master-data/defaults";

export const MSG = {
  category: "Pick a category.",
  unit: "Pick the unit this rent is for.",
  unitIncomeOnly: "Units are only for income.",
  fund: "Pick a fund account.",
  reference: "Pick the closed month this belongs to.",
  referenceNotAllowed: "Only arrear rent and adjustments have a reference month.",
  reserve: "Only expenses can be paid from the Reserve.",
  future: "Date can't be in the future.",
  period: "That month is closed. Record an Adjustment in the open month instead.",
  periodMissing: "Pick an open month.",
  amount: "Enter an amount greater than zero.",
  nothingChanged: "Nothing changed.",
} as const;

type Kind = "INCOME" | "EXPENSE";

export type EntryCheck = {
  kind: Kind;
  category: { code: string; kind: Kind; isActive: boolean } | null;
  unitId: string | null;
  unit: { isActive: boolean } | null;
  fund: { isActive: boolean } | null;
  /** Month key the caller sent, or null. */
  referencePeriod: string | null;
  /** That month's row, or null when it doesn't exist. */
  reference: { status: "OPEN" | "CLOSED"; month: string } | null;
  periodMonth: string;
  txnDate: string;
  today: string;
  fromReserve: boolean;
  /** "adjustment" entries may use ADJUSTMENT_* categories. */
  mode: "manual" | "adjustment";
};

/** "2026-10-31" is the day after "2026-10-30". */
export function isAfterTomorrow(dateIso: string, todayIso: string): boolean {
  const tomorrow = new Date(Date.parse(`${todayIso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return dateIso > tomorrow;
}

/** Field errors, or null when the entry is valid. */
export function checkEntry(e: EntryCheck): Record<string, string> | null {
  const f: Record<string, string> = {};
  const code = e.category?.code;
  const manualBlocked = e.mode === "manual" && (NON_MANUAL_CODES as readonly string[]).includes(code ?? "");
  if (!e.category || !e.category.isActive || e.category.kind !== e.kind || manualBlocked) f.categoryId = MSG.category;

  if (e.kind === "EXPENSE" && e.unitId) f.unitId = MSG.unitIncomeOnly;
  else if (code === "RENT" || code === "ARREAR") {
    if (!e.unitId || !e.unit?.isActive) f.unitId = MSG.unit;
  } else if (e.unitId && !e.unit?.isActive) f.unitId = MSG.unit;

  if (!e.fund?.isActive) f.fundAccountId = MSG.fund;

  const needsReference = code === "ARREAR" || e.mode === "adjustment";
  if (e.referencePeriod && !needsReference) f.referencePeriod = MSG.referenceNotAllowed;
  else if (needsReference && (!e.reference || e.reference.status !== "CLOSED" || e.reference.month >= e.periodMonth)) {
    f.referencePeriod = MSG.reference;
  }

  if (e.fromReserve && e.kind !== "EXPENSE") f.fromReserve = MSG.reserve;
  if (isAfterTomorrow(e.txnDate, e.today)) f.txnDate = MSG.future;
  return Object.keys(f).length ? f : null;
}
