// Client-side shapes of the Advances & loans screen (server DTOs, type-only).
import type { HistoryRow, LoanStatus } from "@/lib/accounting/loans";
import type { AdvanceListDto, AdvanceRowDto, StandingDto } from "@/lib/loans/advance-service";
import type { LoanCardDto, LoanDetailDto } from "@/lib/loans/loan-read";

export type { AdvanceListDto, AdvanceRowDto, HistoryRow, LoanCardDto, LoanDetailDto, LoanStatus, StandingDto };

export type Tab = "loans" | "advances" | "owners";
export type FundOption = { id: string; name: string; balancePaisa: number };

export type LoansPerms = { createLoan: boolean; advance: boolean; repay: boolean; manage: boolean };

export type AdvancesLoansData = {
  tab: Tab;
  filters: { owner: string; status: LoanStatus | ""; year: number };
  summary: { loansOutstandingPaisa: number; activeLoans: number; advancesOutstandingPaisa: number; paidInYearPaisa: number; year: number; years: number[] };
  loans: LoanCardDto[];
  advances: AdvanceRowDto[];
  standing: StandingDto[];
  multiplierPct: number;
  detail: LoanDetailDto | null;
  funds: FundOption[];
  houseFundPaisa: number;
  /** Month the next close applies to (earliest open), or null. */
  openMonth: string | null;
  perms: LoansPerms;
};
