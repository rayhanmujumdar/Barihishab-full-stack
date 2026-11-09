// Pure owner-ledger and share formulas (Owners PRD §3, §7; PRD §5.3–5.4).
// Money is integer paisa; months are "YYYY-MM" keys (they sort as strings).
// Services fetch rows and call these — balances are never stored.

export type LedgerType = "OPENING" | "ENTITLEMENT" | "PAYOUT" | "ADVANCE" | "LOAN_DEDUCTION" | "ADJUSTMENT" | "REVERSAL";
export type BalanceLabel = "OWED" | "ADVANCE" | "SETTLED";
export type OwnerStatus = "current" | "former" | "new";

/** Positive → the house owes them; negative → advance outstanding (§3 Owner balance). */
export function balanceLabel(balancePaisa: number): BalanceLabel {
  return balancePaisa > 0 ? "OWED" : balancePaisa < 0 ? "ADVANCE" : "SETTLED";
}

/** % is always derived from units (Rule 2); clients round for display. */
export function sharePercent(units: number, totalUnits: number): number {
  return totalUnits > 0 ? (units * 100) / totalUnits : 0;
}

// ─── Share sets ───

export type ShareSetLike = { id: string; effectiveMonth: string; replaced: boolean; items: readonly { ownerId: string; units: number }[] };

/** Active sets, oldest first. */
function activeAscending<T extends ShareSetLike>(sets: readonly T[]): T[] {
  return sets.filter((s) => !s.replaced).sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth));
}

/** The active set with the latest effective month ≤ month (Rule 3). */
export function setInForce<T extends ShareSetLike>(sets: readonly T[], month: string): T | null {
  const eligible = activeAscending(sets).filter((s) => s.effectiveMonth <= month);
  return eligible.at(-1) ?? null;
}

export function unitsIn(set: ShareSetLike | null, ownerId: string): number {
  return set?.items.find((i) => i.ownerId === ownerId)?.units ?? 0;
}

export const totalUnits = (set: ShareSetLike | null): number => set?.items.reduce((sum, i) => sum + i.units, 0) ?? 0;

/** current = units today; former = had units, now 0; new = never had units (F9, G2). */
export function ownerStatus(sets: readonly ShareSetLike[], ownerId: string, month: string): { status: OwnerStatus; leftMonth: string | null } {
  const upToNow = activeAscending(sets).filter((s) => s.effectiveMonth <= month);
  const units = upToNow.map((s) => unitsIn(s, ownerId));
  if ((units.at(-1) ?? 0) > 0) return { status: "current", leftMonth: null };
  const lastPositive = units.findLastIndex((u) => u > 0);
  if (lastPositive === -1) return { status: "new", leftMonth: null };
  return { status: "former", leftMonth: upToNow[lastPositive + 1].effectiveMonth };
}

/** One row per active set where this owner's units changed, newest first (F5). */
export function shareHistory<T extends ShareSetLike>(sets: readonly T[], ownerId: string): { set: T; units: number; totalUnits: number }[] {
  const rows: { set: T; units: number; totalUnits: number }[] = [];
  let previous = 0;
  for (const s of activeAscending(sets)) {
    const units = unitsIn(s, ownerId);
    if (units !== previous) rows.push({ set: s, units, totalUnits: totalUnits(s) });
    previous = units;
  }
  return rows.reverse();
}

// ─── Ledger ───

/**
 * Oldest month still owed (F11 "Against: …"): debits pay off credits oldest
 * first; the first credit not fully covered is due. Null when balance ≤ 0.
 */
export function oldestDueMonth(entries: readonly { month: string; amountPaisa: number }[]): string | null {
  const balance = entries.reduce((sum, e) => sum + e.amountPaisa, 0);
  if (balance <= 0) return null;
  let debits = entries.reduce((sum, e) => sum + (e.amountPaisa < 0 ? -e.amountPaisa : 0), 0);
  const credits = entries.filter((e) => e.amountPaisa > 0).sort((a, b) => a.month.localeCompare(b.month));
  // balance > 0 guarantees some credit is not fully covered.
  const due = credits.find((c) => {
    if (debits < c.amountPaisa) return true;
    debits -= c.amountPaisa;
    return false;
  });
  return due!.month;
}

/** A payout never exceeds the positive balance; the rest is excess (Rules 12–13). */
export function splitPayout(amountPaisa: number, balancePaisa: number): { payoutPaisa: number; excessPaisa: number } {
  const payoutPaisa = Math.min(amountPaisa, Math.max(balancePaisa, 0));
  return { payoutPaisa, excessPaisa: amountPaisa - payoutPaisa };
}

export type StatementInput = { month: string; type: LedgerType; amountPaisa: number };

/**
 * Brought forward → rows with running balance → closing (F3). `entries` must be
 * in posting order; `to` null means Latest. Voided originals and their
 * reversals both count, so they cancel (Rule 8).
 */
export function statement<T extends StatementInput>(entries: readonly T[], from: string, to: string | null) {
  let running = 0;
  for (const e of entries) if (e.month < from) running += e.amountPaisa;
  const broughtForwardPaisa = running;
  const totals: Partial<Record<LedgerType, number>> = {};
  const rows: (T & { runningPaisa: number })[] = [];
  for (const e of entries) {
    if (e.month < from || (to !== null && e.month > to)) continue;
    running += e.amountPaisa;
    totals[e.type] = (totals[e.type] ?? 0) + e.amountPaisa;
    rows.push({ ...e, runningPaisa: running });
  }
  return { broughtForwardPaisa, rows, closingPaisa: running, totals };
}

/**
 * Advance limit = average monthly entitlement over the given (last 3 closed)
 * months, floored to paisa. No entitlements yet → no limit (F12, Rule 16).
 */
export function advanceLimit(monthlyEntitlements: readonly number[]): number | null {
  const sum = monthlyEntitlements.reduce((a, b) => a + b, 0);
  return sum > 0 ? Math.floor(sum / monthlyEntitlements.length) : null;
}

type YearRow = { type: LedgerType; amountPaisa: number; date: string; month: string; voided: boolean };

/** Payouts + advances dated in the year, voided ones excluded (F2, G5). */
export function paidOut(entries: readonly YearRow[], year: number): number {
  const y = String(year);
  return entries
    .filter((e) => (e.type === "PAYOUT" || e.type === "ADVANCE") && !e.voided && e.date.startsWith(y))
    .reduce((sum, e) => sum - e.amountPaisa, 0);
}

/** Entitlements of the periods in that year (F2). */
export function entitlementTotal(entries: readonly YearRow[], year: number): number {
  const y = String(year);
  return entries.filter((e) => e.type === "ENTITLEMENT" && e.month.startsWith(y)).reduce((sum, e) => sum + e.amountPaisa, 0);
}
