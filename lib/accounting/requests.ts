// Money requests rules (Requests PRD §3, §4, §8): pure, so the services and
// the UI share one source for transitions, approval limits and estimates.
import { formatMoney } from "@/lib/money";
import { allocate, staircase, type Holder, type StaircaseInput } from "./distribution";

export const REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "WITHDRAWN", "DISBURSED"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const REQUEST_TYPES = ["ADVANCE", "LOAN", "GRANT"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];
export const REQUEST_ACTIONS = ["edit", "cancel", "approve", "reject", "withdraw", "disburse"] as const;
export type RequestAction = (typeof REQUEST_ACTIONS)[number];

const FROM: Record<RequestAction, readonly RequestStatus[]> = {
  edit: ["PENDING"],
  cancel: ["PENDING", "APPROVED"],
  approve: ["PENDING"],
  reject: ["PENDING"],
  withdraw: ["APPROVED"],
  disburse: ["APPROVED"],
};

/** §4: which statuses an action may start from; final statuses allow nothing. */
export function canTransition(status: RequestStatus, action: RequestAction): boolean {
  return FROM[action].includes(status);
}

/** Rule 4: ৳1 ≤ approved ≤ requested; approving less needs a note (G2). Null when fine. */
export function approveCheck(requestedPaisa: number, approvedPaisa: number, note: string | null | undefined): Record<string, string> | null {
  if (!Number.isInteger(approvedPaisa) || approvedPaisa < 100 || approvedPaisa > requestedPaisa) {
    return { amountPaisa: `Approve between ৳1 and ${formatMoney("en", requestedPaisa)}.` };
  }
  if (approvedPaisa < requestedPaisa && !note?.trim()) return { note: "Explain why the amount is lower." };
  return null;
}

/** G9: R-2026-014. */
export function formatRequestNumber(year: number, number: number): string {
  return `R-${year}-${String(number).padStart(3, "0")}`;
}

/** G5: a pending request past its needed-by date. Dates are ISO "YYYY-MM-DD". */
export function isOverdue(r: { status: RequestStatus; neededBy: string }, today: string): boolean {
  return r.status === "PENDING" && r.neededBy < today;
}

const BN_ZERO = "০".charCodeAt(0);

/** F7: the monthly instalment written in a repayment plan ("৳4,000 per month" → 400000). */
export function planInstalment(plan: string | null | undefined): number | null {
  if (!plan) return null;
  const latin = plan.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - BN_ZERO));
  const m = /(\d[\d,]*)(?:\.(\d{1,2}))?/.exec(latin);
  if (!m) return null;
  const paisa = Number(m[1].replace(/,/g, "")) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return paisa > 0 ? paisa : null;
}

/** F4 loan context: would the plan pay the loan off within `months`? Null without an instalment. */
export function finishesWithin(amountPaisa: number, instalmentPaisa: number | null, months: number): boolean | null {
  if (!instalmentPaisa) return null;
  return Math.ceil(amountPaisa / instalmentPaisa) <= months;
}

export type GrantImpact = {
  distributableBeforePaisa: number;
  distributableAfterPaisa: number;
  dropPaisa: number;
  /** "About ৳X less for each 10 % share" (F2). */
  perTenPctPaisa: number;
  owners: { ownerId: string; dropPaisa: number }[];
};

/** F4/G7, §11.3: the open month's distributable with and without the grant as an extra expense. */
export function grantImpact(month: StaircaseInput, holders: readonly Holder[], amountPaisa: number): GrantImpact {
  const before = staircase(month).distributablePaisa;
  const after = staircase({ ...month, expensePaisa: month.expensePaisa + amountPaisa }).distributablePaisa;
  const a = allocate(before, holders);
  const b = new Map(allocate(after, holders).map((x) => [x.ownerId, x.amountPaisa]));
  const drop = before - after;
  return {
    distributableBeforePaisa: before,
    distributableAfterPaisa: after,
    dropPaisa: drop,
    perTenPctPaisa: Math.floor(drop / 10),
    owners: a.map((x) => ({ ownerId: x.ownerId, dropPaisa: x.amountPaisa - b.get(x.ownerId)! })),
  };
}

export type ReminderKind = "PENDING_3_DAYS" | "APPROVED_PAST_DUE";

const dayNumber = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;

/** F13/G14: pending more than 3 days; approved and unpaid after the needed-by date. */
export function reminderKinds(r: { status: RequestStatus; askedOn: string; neededBy: string }, today: string): ReminderKind[] {
  if (r.status === "PENDING" && dayNumber(today) - dayNumber(r.askedOn) > 3) return ["PENDING_3_DAYS"];
  if (r.status === "APPROVED" && r.neededBy < today) return ["APPROVED_PAST_DUE"];
  return [];
}

/** §10: other owners only get the short reason. */
export function shortReason(reason: string, max = 80): string {
  const clean = reason.trim().replace(/\s+/g, " ");
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

export type Visibility = "full" | "limited" | "none";

/** Rule 12, G6: own requests in full; others' only once disbursed, limited fields. */
export function visibleTo(r: { status: RequestStatus; ownerUserId: string | null; createdById: string }, viewer: { userId: string; viewAll: boolean }): Visibility {
  if (viewer.viewAll || r.ownerUserId === viewer.userId || r.createdById === viewer.userId) return "full";
  return r.status === "DISBURSED" ? "limited" : "none";
}
