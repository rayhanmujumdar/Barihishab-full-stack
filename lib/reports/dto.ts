// Report DTOs (Reports PRD F2–F3, F9–F11). One DTO per report feeds the
// screen, the print view and the CSV, so all three show the same numbers.
import type { MonthFigure, RentRollMonth, RentRollRow, ShareChange, YearSums } from "@/lib/accounting/reports";
import type { BalanceLabel } from "@/lib/accounting/owners";

export type ReportStatus = "FINAL" | "DRAFT";
export type House = { name: string; address: string | null };

export type ReportEntry = {
  id: string;
  date: string;
  description: string | null;
  vendor: string | null;
  unitName: string | null;
  fundName: string;
  amountPaisa: number;
  fromReserve: boolean;
  attachments: { id: string; fileName: string; mime: string }[];
};

export type ReportCategory = {
  categoryId: string;
  code: string;
  nameEn: string;
  nameBn: string;
  count: number;
  amountPaisa: number;
  shareBp: number;
  /** Same category last month (expenses only; 0 when none, null when there is no last month). */
  previousPaisa: number | null;
  entries: ReportEntry[];
};

export type OwnerRow = {
  ownerId: string;
  displayName: string;
  initials: string;
  units: number;
  sharePercent: number | null;
  openingPaisa: number;
  entitlementPaisa: number;
  receivedPaisa: number;
  advancePaisa: number;
  loanDeductionPaisa: number;
  otherPaisa: number;
  balancePaisa: number;
  balanceLabel: BalanceLabel;
  loanOutstandingPaisa: number;
};

export type OwnerTotals = Omit<OwnerRow, "ownerId" | "displayName" | "initials" | "units" | "sharePercent" | "balanceLabel">;

export type CompareFigure = { key: string; status: ReportStatus; incomePaisa: number; expensesAllPaisa: number; distributablePaisa: number };

export type MonthlyReportDto = {
  house: House;
  month: { key: string; status: ReportStatus; closedAt: string | null; closedBy: string | null };
  /** Newest first, for the month picker. */
  months: { key: string; status: "OPEN" | "CLOSED" }[];
  summary: { incomePaisa: number; expensesAllPaisa: number; distributablePaisa: number; deficitCarriedPaisa: number };
  income: { totalPaisa: number; count: number; categories: ReportCategory[] };
  expenses: { totalPaisa: number; fromReservePaisa: number; count: number; categories: ReportCategory[] };
  staircase: {
    incomePaisa: number;
    expensesCountedPaisa: number;
    reserveSpentPaisa: number;
    reservePaisa: number;
    reserveSource: "RULE" | "OVERRIDE";
    previousDeficitPaisa: number;
    previousDeficitMonth: string | null;
    distributablePaisa: number;
    deficitCarriedPaisa: number;
  };
  owners: { rows: OwnerRow[]; totals: OwnerTotals };
  notes: {
    reopen: { at: string; reason: string } | null;
    overrideReason: string | null;
    unpaidUnits: { name: string; tenantName: string | null }[];
    deficit: { amountPaisa: number; nextMonth: string } | null;
  };
  compare: { lastMonth: CompareFigure | null; lastYear: CompareFigure | null };
  empty: boolean;
};

export type MonthlyResult = MonthlyReportDto | { month: null };

export type YearMonthColumn = { month: string; status: ReportStatus | "NONE"; figure: MonthFigure | null };

export type OwnerYearRow = {
  ownerId: string;
  displayName: string;
  unitsNow: number;
  sharePercentNow: number | null;
  shareChanges: ShareChange[];
  openingPaisa: number;
  entitlementPaisa: number;
  paidOutPaisa: number;
  advancesPaisa: number;
  loanDeductionPaisa: number;
  otherPaisa: number;
  balanceNowPaisa: number;
  balanceLabel: BalanceLabel;
  loanOutstandingPaisa: number;
};

export type YearlyReportDto = {
  house: House;
  year: number;
  /** Years with at least one period, newest first. */
  years: number[];
  empty: boolean;
  months: YearMonthColumn[];
  totals: { closed: YearSums; draft: YearSums; closedCount: number; draftCount: number };
  topExpenseCategories: { categoryId: string; code: string; nameEn: string; nameBn: string; amountPaisa: number; shareBp: number }[];
  owners: {
    rows: OwnerYearRow[];
    totals: Pick<OwnerYearRow, "openingPaisa" | "entitlementPaisa" | "paidOutPaisa" | "advancesPaisa" | "loanDeductionPaisa" | "otherPaisa" | "balanceNowPaisa" | "loanOutstandingPaisa">;
  };
};

export type RentRollDto = { house: House; year: number; years: number[]; months: (RentRollMonth & { status: ReportStatus | "NONE" })[]; rows: RentRollRow[] };

export type ExpenseAnalysisDto = {
  house: House;
  from: string;
  to: string;
  categoryIds: string[];
  totalPaisa: number;
  fromReservePaisa: number;
  count: number;
  byCategory: { categoryId: string; code: string; nameEn: string; nameBn: string; amountPaisa: number; shareBp: number; count: number }[];
  topVendors: { vendor: string | null; amountPaisa: number; count: number }[];
  trend: { month: string; amounts: Record<string, number>; totalPaisa: number }[];
  topExpenses: { id: string; date: string; month: string; categoryNameEn: string; categoryNameBn: string; description: string | null; vendor: string | null; amountPaisa: number }[];
  /** Expense categories to choose from. */
  categories: { id: string; code: string; nameEn: string; nameBn: string }[];
};

export type FundsReportDto = {
  house: House;
  period: { kind: "month"; month: string } | { kind: "year"; year: number };
  rows: { fundAccountId: string; name: string; type: "CASH" | "BANK" | "WALLET"; isActive: boolean; openingPaisa: number; incomePaisa: number; expensesPaisa: number; ownerPaymentsPaisa: number; loansOutPaisa: number; loanRepaymentsPaisa: number; closingPaisa: number }[];
  totals: { openingPaisa: number; incomePaisa: number; expensesPaisa: number; ownerPaymentsPaisa: number; loansOutPaisa: number; loanRepaymentsPaisa: number; closingPaisa: number };
  months: { key: string; status: "OPEN" | "CLOSED" }[];
  years: number[];
};
