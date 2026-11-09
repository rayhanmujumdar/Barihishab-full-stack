// Owner read models (Owners PRD F1, F2). Money is integer paisa as `number`.
import type { BalanceLabel, OwnerStatus } from "@/lib/accounting/owners";

export type OwnerTags = { superAdmin: boolean; invitePending: boolean; noLogin: boolean };

export type OwnerDto = {
  id: string;
  userId: string | null;
  displayName: string;
  initials: string;
  sortOrder: number;
  note: string | null;
  responsibility: string | null;
  units: number;
  sharePercent: number;
  status: OwnerStatus;
  leftMonth: string | null;
  tags: OwnerTags;
  isViewer: boolean;
  balancePaisa: number;
  balanceLabel: BalanceLabel;
  loanOutstandingPaisa: number;
};

export type ShareHistoryRow = {
  shareSetId: string;
  effectiveMonth: string;
  units: number;
  sharePercent: number;
  reason: string;
  savedBy: string;
  savedAt: string;
};

export type OwnerDetailDto = OwnerDto & {
  email: string | null;
  phone: string | null;
  /** The linked login's own name (null for name-only owners). */
  userName: string | null;
  year: number;
  entitlementPaisa: number;
  paidOutPaisa: number;
  oldestDueMonth: string | null;
  shareHistory: ShareHistoryRow[];
};

export type OwnerListDto = { houseName: string; totalUnits: number; owners: OwnerDto[]; formerOwners: OwnerDto[] };
