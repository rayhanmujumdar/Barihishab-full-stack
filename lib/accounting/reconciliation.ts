// House Fund reconciliation (main PRD §5.7; Home PRD F5, G8, Rule 8). Pure:
// the Home desk gathers each part from its own read model and asks here.
//
//   FundBalance = Σ OwnerBalance + ReserveBalance + OpenPeriodNet − DeficitCarried − LoanOutstanding

export type ReconcileInput = {
  /** Σ balances of the active fund accounts. */
  fundPaisa: number;
  /** Σ every owner's ledger balance. */
  ownerBalancesPaisa: number;
  /** Starting reserve + kept in closed months − expenses paid from the reserve. */
  reservePaisa: number;
  /** Over every open month: income − expenses not paid from the reserve. */
  openNetPaisa: number;
  /** Deficit carried out of the latest closed month. */
  deficitCarriedPaisa: number;
  /** Outstanding of every active loan. */
  loansOutstandingPaisa: number;
};

export type Reconciliation = {
  status: "BALANCED" | "CHECK";
  expectedPaisa: number;
  /** fund − expected; 0 when balanced. */
  mismatchPaisa: number;
  parts: ReconcileInput;
};

export function reconcile(parts: ReconcileInput): Reconciliation {
  const expectedPaisa = parts.ownerBalancesPaisa + parts.reservePaisa + parts.openNetPaisa - parts.deficitCarriedPaisa - parts.loansOutstandingPaisa;
  const mismatchPaisa = parts.fundPaisa - expectedPaisa;
  return { status: mismatchPaisa === 0 ? "BALANCED" : "CHECK", expectedPaisa, mismatchPaisa, parts };
}
