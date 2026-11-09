// Data handed from the Owners pages (server) to their client views.
import type { BalanceLabel, LedgerType } from "@/lib/accounting/owners";
import type { OwnerDetailDto, OwnerDto, OwnerListDto } from "@/lib/owners/dto";
import type { LedgerEntryDto, StatementDto } from "@/lib/owners/ledger-service";
import type { ShareSetDto } from "@/lib/owners/share-service";

export type { BalanceLabel, LedgerEntryDto, LedgerType, OwnerDetailDto, OwnerDto, OwnerListDto, ShareSetDto, StatementDto };

export type PeriodLite = { month: string; status: "OPEN" | "CLOSED" };
export type FundLite = { id: string; name: string; isActive: boolean; balancePaisa: number };
export type UserLite = { id: string; name: string };

export type OwnersData = {
  list: OwnerListDto;
  timeline: ShareSetDto[];
  periods: PeriodLite[];
  /** Months a share set may start in: open months + the month after the latest period. */
  effectiveMonths: string[];
  linkableUsers: UserLite[];
  perms: { manage: boolean; shares: boolean };
};

export type OwnerPageData = {
  owner: OwnerDetailDto;
  statement: StatementDto;
  /** Every month the To picker offers (oldest → newest, up to the latest open month). */
  months: string[];
  latestOpen: string | null;
  anyClosed: boolean;
  funds: FundLite[];
  houseFundPaisa: number;
  linkableUsers: UserLite[];
  /** Existing period months (adjustment reference picker). */
  periodMonths: string[];
  perms: { pay: boolean; advance: boolean; void: boolean; adjust: boolean; manage: boolean };
};
