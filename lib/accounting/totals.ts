// Pure accounting formulas (Income & Expenses PRD §11). Distribution and the
// dashboard read these numbers; they are always computed, never stored.

export type TxnKind = "INCOME" | "EXPENSE";

export type PeriodTotals = {
  incomePaisa: number;
  /** Expenses that cut the distributable (excludes From-Reserve). */
  expensePaisa: number;
  /** Expenses paid from the Reserve. */
  reserveSpentPaisa: number;
  incomeCount: number;
  expenseCount: number;
};

/** One row of `groupBy(kind, fromReserve)` over non-voided entries. */
export type TotalsGroup = { kind: TxnKind; fromReserve: boolean; sum: number; count: number };

export function toPeriodTotals(groups: readonly TotalsGroup[]): PeriodTotals {
  const t: PeriodTotals = { incomePaisa: 0, expensePaisa: 0, reserveSpentPaisa: 0, incomeCount: 0, expenseCount: 0 };
  for (const g of groups) {
    if (g.kind === "INCOME") {
      t.incomePaisa += g.sum;
      t.incomeCount += g.count;
    } else {
      if (g.fromReserve) t.reserveSpentPaisa += g.sum;
      else t.expensePaisa += g.sum;
      t.expenseCount += g.count;
    }
  }
  return t;
}

/**
 * Balance(a) = opening + Σ income − Σ expense + Σ owner-ledger moves − Σ loans
 * disbursed (PRD §9.5). Ledger moves are signed: payouts/advances negative,
 * their reversals positive. Transfers come later.
 */
export function fundBalance(openingPaisa: number, incomePaisa: number, expensePaisa: number, ledgerPaisa = 0, loansPaisa = 0): number {
  return openingPaisa + incomePaisa - expensePaisa + ledgerPaisa - loansPaisa;
}
