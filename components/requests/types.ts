// Page data for the Requests screen (Requests PRD F1). Client-safe.
import type { DecisionContext, RequestDetailDto, RequestDto, RequestListDto, RequestStatus, RequestType } from "@/lib/requests/dto";
import type { RequestReminder } from "@/lib/requests/reminders";

export type { DecisionContext, RequestDetailDto, RequestDto, RequestListDto, RequestReminder, RequestStatus, RequestType };

export type RequestPerms = { create: boolean; viewAll: boolean; decide: boolean; disburse: boolean; record: boolean };
export type FundOption = { id: string; name: string; balancePaisa: number };
export type OwnerOption = { id: string; name: string };
/** Super Admin: decide · approved · history. Owner: mine · paid (F1). */
export type RequestTab = "decide" | "approved" | "history" | "mine" | "paid";
export const ADMIN_TABS: RequestTab[] = ["decide", "approved", "history"];
export const OWNER_TABS: RequestTab[] = ["mine", "paid"];

export type Filters = { owner: string; type: RequestType | ""; status: RequestStatus | ""; year: number | null; limit: number | null };

export type RequestsPageData = {
  tab: RequestTab;
  list: RequestListDto;
  /** Decision context per PENDING / APPROVED request (Super Admin only). */
  contexts: Record<string, DecisionContext>;
  filters: Filters;
  perms: RequestPerms;
  /** The viewer's own owner record; null → they can only record for others. */
  ownOwnerId: string | null;
  owners: OwnerOption[];
  funds: FundOption[];
  /** Latest open month (YYYY-MM); null → Disburse is disabled (G13). */
  openMonth: string | null;
  detail: RequestDetailDto | null;
};
