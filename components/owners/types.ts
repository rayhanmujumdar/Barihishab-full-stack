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
  /** Questioned share changes (share set id → complaint id) (Notices & Complaints C8). */
  complaints?: OwnerComplaints;
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
  perms: { pay: boolean; advance: boolean; void: boolean; adjust: boolean; manage: boolean; loan: boolean };
  /** Advance limit for this owner (Advances & Loans F14); null = no closed months yet. */
  advanceLimitPaisa?: number | null;
  /** Questioned payments/advances (entry id → complaint id) and whether the viewer may raise one (Notices & Complaints C8). */
  complaints?: OwnerComplaints;
};

export type OwnerComplaints = { questioned: Record<string, string>; complain: boolean };

/** What the pay / advance drawer needs: the owner's id, name and balance plus the fund accounts (F11, F12; Distribution F12). */
export type PayDrawerData = Pick<OwnerPageData, "funds" | "houseFundPaisa" | "advanceLimitPaisa"> & {
  owner: Pick<OwnerDetailDto, "id" | "displayName" | "balancePaisa" | "balanceLabel" | "oldestDueMonth">;
};
