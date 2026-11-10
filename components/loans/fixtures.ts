// Advances & Loans PRD §2.2 sample data for component tests.
import type { AdvancesLoansData, AdvanceRowDto, HistoryRow, LoanCardDto, LoanDetailDto, StandingDto } from "./types";

const mv = (over: Partial<HistoryRow>): HistoryRow => ({
  id: "m",
  kind: "DEDUCTION",
  source: "LEDGER",
  date: "2026-07-31",
  month: "2026-07",
  amountPaisa: 500000,
  effectPaisa: -500000,
  runningPaisa: 4500000,
  onClose: true,
  voided: false,
  voidReason: null,
  voidable: false,
  reversesId: null,
  recordedBy: "Rayhan Ahmed",
  note: null,
  ...over,
});

export const l2 = (over: Partial<LoanCardDto> = {}): LoanCardDto => ({
  id: "l-2",
  number: 2,
  ownerId: "o-tanvir",
  ownerName: "Tanvir Ahmed",
  principalPaisa: 5000000,
  disbursedOn: "2026-06-10",
  status: "ACTIVE",
  reason: "Daughter's school admission",
  installmentPaisa: 500000,
  outstandingPaisa: 3500000,
  origin: "DIRECT",
  isSelf: false,
  flagged: false,
  request: null,
  repaidPaisa: 1500000,
  repaidCashPaisa: 0,
  repaidDeductionPaisa: 1500000,
  progress: 0.3,
  expectedFinishMonth: "2027-04",
  monthsLeft: 7,
  nextDeduction: { amountPaisa: 500000, month: "2026-10" },
  recentMovements: [
    mv({ id: "d1", date: "2026-07-31", month: "2026-07", runningPaisa: 4500000 }),
    mv({ id: "d2", date: "2026-08-31", month: "2026-08", runningPaisa: 4000000 }),
    mv({ id: "d3", date: "2026-09-30", month: "2026-09", runningPaisa: 3500000 }),
  ],
  ...over,
});

export const l1 = (): LoanCardDto =>
  l2({
    id: "l-1",
    number: 1,
    ownerId: "o-farzana",
    ownerName: "Farzana Haque",
    principalPaisa: 2000000,
    disbursedOn: "2026-02-12",
    status: "REPAID",
    reason: "Laptop for work",
    installmentPaisa: null,
    outstandingPaisa: 0,
    repaidPaisa: 2000000,
    repaidCashPaisa: 2000000,
    repaidDeductionPaisa: 0,
    progress: 1,
    expectedFinishMonth: null,
    monthsLeft: null,
    nextDeduction: null,
    recentMovements: [mv({ id: "c1", kind: "CASH_REPAYMENT", source: "MOVEMENT", date: "2026-03-30", month: "2026-03", amountPaisa: 1000000, runningPaisa: 1000000, onClose: false })],
  });

export const detail = (): LoanDetailDto => ({
  loan: { ...l2(), fundAccountId: "f-bank", fundAccountName: "DBBL savings", method: "BANK", referenceNo: "TRX-88", payoutEntryId: null, recordedBy: "Rayhan Ahmed" },
  movements: [
    mv({ id: "disbursed", kind: "DISBURSED", source: "LOAN", date: "2026-06-10", month: "2026-06", amountPaisa: 5000000, runningPaisa: 5000000, onClose: false }),
    mv({ id: "c9", kind: "CASH_REPAYMENT", source: "MOVEMENT", date: "2026-07-02", month: "2026-07", amountPaisa: 1000000, runningPaisa: 4000000, onClose: false, voided: true, voidReason: "Recorded on the wrong loan" }),
    mv({ id: "r9", kind: "REVERSAL", source: "MOVEMENT", date: "2026-07-03", month: "2026-07", amountPaisa: 1000000, runningPaisa: 5000000, onClose: false }),
    mv({ id: "m9", kind: "DEDUCTION", date: "2026-07-20", month: "2026-07", amountPaisa: 100000, runningPaisa: 4900000, onClose: false, voidable: true }),
    mv({ id: "skipped-2026-09", kind: "SKIPPED", source: "SNAPSHOT", date: "2026-09-30", month: "2026-09", amountPaisa: 0, runningPaisa: 4900000, recordedBy: null }),
  ],
  changes: [{ at: "2026-10-01T04:00:00.000Z", action: "loan.updated", by: "Rayhan Ahmed", before: { installmentPaisa: 300000 }, after: { installmentPaisa: 500000 }, reason: "Back to normal" }],
});

export const standing = (over: Partial<StandingDto> = {}): StandingDto => ({
  ownerId: "o-tanvir",
  displayName: "Tanvir Ahmed",
  loanOutstandingPaisa: 3500000,
  activeLoans: 1,
  balancePaisa: -200000,
  advanceOutstandingPaisa: 200000,
  averageEntitlementPaisa: 1243595,
  limitPaisa: 1243595,
  limitUsedPct: 16,
  lastAdvanceDate: "2026-10-14",
  latestActiveLoan: { id: "l-2", number: 2, outstandingPaisa: 3500000 },
  ...over,
});

export const nasrin = (over: Partial<StandingDto> = {}): StandingDto =>
  standing({ ownerId: "o-nasrin", displayName: "Nasrin Ahmed", loanOutstandingPaisa: 0, activeLoans: 0, balancePaisa: 0, advanceOutstandingPaisa: 0, averageEntitlementPaisa: 3316253, limitPaisa: 3316253, limitUsedPct: 0, latestActiveLoan: null, ...over });

export const advanceRow = (over: Partial<AdvanceRowDto> = {}): AdvanceRowDto => ({
  id: "a-1",
  ownerId: "o-nasrin",
  ownerName: "Nasrin Ahmed",
  date: "2026-10-12",
  month: "2026-10",
  amountPaisa: 500000,
  reason: "Eye check-up",
  origin: "DIRECT",
  isSelf: false,
  flagged: false,
  status: "RECOVERED",
  recoveredMonth: "2026-10",
  voidReason: null,
  ownerBalancePaisa: 2882760,
  request: null,
  ...over,
});

export function pageData(over: Partial<AdvancesLoansData> = {}): AdvancesLoansData {
  return {
    tab: "loans",
    filters: { owner: "", status: "", year: 2026 },
    summary: { loansOutstandingPaisa: 3500000, activeLoans: 1, advancesOutstandingPaisa: 500000, paidInYearPaisa: 500000, year: 2026, years: [2026] },
    loans: [l2(), l1()],
    advances: [],
    standing: [nasrin(), standing()],
    multiplierPct: 100,
    detail: null,
    funds: [{ id: "f-cash", name: "Cash box", balancePaisa: 10000000 }],
    houseFundPaisa: 10000000,
    openMonth: "2026-10",
    perms: { createLoan: true, advance: true, repay: true, manage: true },
    ...over,
  };
}

export const ownerPerms = { createLoan: false, advance: false, repay: false, manage: false };
