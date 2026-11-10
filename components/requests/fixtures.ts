// Requests PRD §2.2 sample data for component tests.
import type { DecisionContext, RequestDto, RequestsPageData } from "./types";

export const req = (over: Partial<RequestDto> = {}): RequestDto => ({
  id: "00000000-0000-4000-8000-000000000a01",
  number: "R-2026-014",
  ownerId: "o-nasrin",
  ownerName: "Nasrin Ahmed",
  type: "ADVANCE",
  status: "PENDING",
  amountRequestedPaisa: 1000000,
  amountApprovedPaisa: null,
  reason: "Cataract surgery deposit at Ispahani Eye Hospital",
  neededBy: "2026-10-30",
  repaymentPlan: null,
  askedOn: "2026-10-19",
  isSelf: false,
  recordedBy: null,
  decidedBy: null,
  decidedAt: null,
  decisionNote: null,
  disbursedAt: null,
  overdue: false,
  mine: false,
  unseen: false,
  limited: false,
  attachmentCount: 0,
  linkedEntry: null,
  ...over,
});

export const tanvirApproved = () =>
  req({
    id: "00000000-0000-4000-8000-000000000a02",
    number: "R-2026-015",
    ownerId: "o-tanvir",
    ownerName: "Tanvir Ahmed",
    status: "APPROVED",
    amountRequestedPaisa: 800000,
    amountApprovedPaisa: 600000,
    reason: "Car service before the trip home",
    neededBy: "2026-10-25",
    askedOn: "2026-10-18",
    decidedBy: "Rayhan Ahmed",
    decisionNote: "Reduced — bank balance is low until rent clears",
  });

export const context = (over: Partial<DecisionContext> = {}): DecisionContext => ({
  balancePaisa: -500000,
  loanOutstandingPaisa: 0,
  advanceLimitPaisa: 3316300,
  advanceUsedPaisa: 500000,
  houseFundPaisa: 12450875,
  funds: [{ id: "f-cash", name: "Cash", balancePaisa: 3100000 }],
  openMonth: "2026-10",
  advance: { usedBeforePaisa: 500000, usedAfterPaisa: 1500000, limitPaisa: 3316300, overLimit: false },
  loan: null,
  grant: null,
  pendingOthers: [],
  aboveHouseFund: false,
  ...over,
});

export const adminPerms = { create: true, viewAll: true, decide: true, disburse: true, record: true };
export const ownerPerms = { create: true, viewAll: false, decide: false, disburse: false, record: false };

export function adminPage(over: Partial<RequestsPageData> = {}): RequestsPageData {
  const pending = req();
  return {
    tab: "decide",
    list: { scope: "all", pending: [pending], approved: [tanvirApproved()], history: [], historyMore: false, years: [2026] },
    contexts: { [pending.id]: context() },
    filters: { owner: "", type: "", status: "", year: null, limit: null },
    perms: adminPerms,
    ownOwnerId: "o-rayhan",
    owners: [
      { id: "o-nasrin", name: "Nasrin Ahmed" },
      { id: "o-tanvir", name: "Tanvir Ahmed" },
    ],
    funds: [{ id: "f-cash", name: "Cash", balancePaisa: 3100000 }],
    openMonth: "2026-10",
    detail: null,
    ...over,
  };
}

export function ownerPage(over: Partial<RequestsPageData> = {}): RequestsPageData {
  return {
    tab: "mine",
    list: { scope: "own", mine: [], paidOut: [], paidOutMore: false },
    contexts: {},
    filters: { owner: "", type: "", status: "", year: null, limit: null },
    perms: ownerPerms,
    ownOwnerId: "o-nasrin",
    owners: [],
    funds: [],
    openMonth: "2026-10",
    detail: null,
    ...over,
  };
}
