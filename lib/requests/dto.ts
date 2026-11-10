// Shapes in which money requests leave the API (Requests PRD F1, F9, F12).
// Types only — safe to import from client components.
import type { RequestStatus, RequestType } from "@/lib/accounting/requests";

export type { RequestStatus, RequestType };

export type LinkedEntry = {
  kind: "ADVANCE" | "LOAN" | "EXPENSE";
  id: string;
  /** English label ("Loan L3", "Expense in 2026-10"); the UI formats its own. */
  label: string;
  loanNumber: number | null;
  /** YYYY-MM the entry was posted in. */
  month: string | null;
  ownerId: string;
  voided: boolean;
};

export type RequestDto = {
  id: string;
  number: string;
  ownerId: string;
  ownerName: string;
  type: RequestType;
  status: RequestStatus;
  amountRequestedPaisa: number;
  amountApprovedPaisa: number | null;
  reason: string;
  neededBy: string;
  repaymentPlan: string | null;
  /** Asia/Dhaka date the request was made. */
  askedOn: string;
  isSelf: boolean;
  /** "Recorded by {Admin}" when entered on the owner's behalf (F11). */
  recordedBy: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  disbursedAt: string | null;
  overdue: boolean;
  /** The viewer asked for it (owner linked to them, or they created it). */
  mine: boolean;
  /** A decision on the viewer's own request they haven't seen yet (badge). */
  unseen: boolean;
  /** Another owner's paid-out request: only the public fields are filled (Rule 12). */
  limited: boolean;
  attachmentCount: number;
  linkedEntry: LinkedEntry | null;
};

export type RequestAttachmentDto = { id: string; fileName: string; mime: string; sizeBytes: number; isPrivate: boolean };

export type TimelineItem = {
  kind: "SUBMITTED" | "RECORDED" | "EDITED" | "APPROVED" | "REJECTED" | "WITHDRAWN" | "CANCELLED" | "DISBURSED";
  at: string;
  by: string | null;
  amountPaisa: number | null;
  note: string | null;
  date: string | null;
  method: "CASH" | "BANK" | "BKASH" | "NAGAD" | null;
  referenceNo: string | null;
};

export type DecisionContext = {
  balancePaisa: number;
  loanOutstandingPaisa: number;
  advanceLimitPaisa: number | null;
  advanceUsedPaisa: number;
  houseFundPaisa: number;
  funds: { id: string; name: string; balancePaisa: number }[];
  openMonth: string | null;
  advance: { usedBeforePaisa: number; usedAfterPaisa: number; limitPaisa: number | null; overLimit: boolean } | null;
  loan: { activeLoans: { id: string; number: number; outstandingPaisa: number }[]; planInstalmentPaisa: number | null; finishesWithin24Months: boolean | null } | null;
  grant: { month: string; distributableBeforePaisa: number; dropPaisa: number; owners: { ownerId: string; name: string; sharePct: number; dropPaisa: number }[] } | null;
  pendingOthers: string[];
  aboveHouseFund: boolean;
};

export type RequestDetailDto = {
  request: RequestDto;
  attachments: RequestAttachmentDto[];
  timeline: TimelineItem[];
  context: DecisionContext | null;
};

export type FormContextDto = {
  ownerId: string;
  ownerName: string;
  balancePaisa: number;
  advanceLimitPaisa: number | null;
  advanceUsedPaisa: number;
  activeLoans: { id: string; number: number; outstandingPaisa: number }[];
  openMonth: string | null;
  /** Grant hint: about this much less for each 10 % share (F2). */
  grantPerTenPctPaisa: number | null;
  pendingNumbers: string[];
};

export type RequestWarning =
  | { code: "PENDING_EXISTS"; number: string }
  | { code: "ADVANCE_OVER_LIMIT"; limitPaisa: number }
  | { code: "OWNER_OWED"; balancePaisa: number }
  | { code: "OWNER_HAS_LOAN"; loanNumber: number; outstandingPaisa: number }
  | { code: "FUND_SHORT"; fundAccountId: string; balancePaisa: number }
  | { code: "HOUSE_FUND_SHORT"; balancePaisa: number };

export type RequestListDto =
  | { scope: "all"; pending: RequestDto[]; approved: RequestDto[]; history: RequestDto[]; historyMore: boolean; years: number[] }
  | { scope: "own"; mine: RequestDto[]; paidOut: RequestDto[]; paidOutMore: boolean };
