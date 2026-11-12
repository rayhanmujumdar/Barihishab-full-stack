// Complaint rules (Notices & Complaints PRD §4, §5, C1, C5–C7, G12–G15, G18;
// design D3). Pure and client-safe; services and routes call these so the
// lifecycle and windows live in one place.
import { MINUTE, DAY } from "@/lib/clock";

export const COMPLAINT_STATUSES = ["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED", "WITHDRAWN"] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];
export type ComplaintVisibility = "ALL" | "ADMIN";
export type ComplaintAction = "IN_REVIEW" | "RESOLVE" | "REJECT" | "WITHDRAW" | "REOPEN";

export const REOPEN_WINDOW_MS = 14 * DAY;
export const COMMENT_EDIT_MS = 15 * MINUTE;

const MOVES: Record<ComplaintStatus, Partial<Record<ComplaintAction, ComplaintStatus>>> = {
  OPEN: { IN_REVIEW: "IN_REVIEW", RESOLVE: "RESOLVED", REJECT: "REJECTED", WITHDRAW: "WITHDRAWN" },
  IN_REVIEW: { RESOLVE: "RESOLVED", REJECT: "REJECTED", WITHDRAW: "WITHDRAWN" },
  RESOLVED: { REOPEN: "OPEN" },
  REJECTED: { REOPEN: "OPEN" },
  WITHDRAWN: {},
};

/** The status an action leads to, or null when §4 doesn't allow it. */
export function nextStatus(status: ComplaintStatus, action: ComplaintAction): ComplaintStatus | null {
  return MOVES[status][action] ?? null;
}

/** Open and In review are "live": they take comments and mark linked items Questioned. */
export const isLive = (status: ComplaintStatus) => status === "OPEN" || status === "IN_REVIEW";

/** Rule 8: Everyone → all members; Admin only → the author and `complaint.view.all`. */
export function canSee(c: { visibility: ComplaintVisibility; createdById: string }, viewer: { userId: string; viewAll: boolean }): boolean {
  return c.visibility === "ALL" || viewer.viewAll || c.createdById === viewer.userId;
}

/** G15 / Rule 9: only the author, only Admin only → Everyone. */
export function canPublish(c: { visibility: ComplaintVisibility; createdById: string }, userId: string): "FORBIDDEN" | "INVALID_COMPLAINT_STATUS" | null {
  if (c.createdById !== userId) return "FORBIDDEN";
  return c.visibility === "ADMIN" ? null : "INVALID_COMPLAINT_STATUS";
}

/** C6 / G12: Resolved or Rejected, once, within 14 days of closing. */
export function canReopen(c: { status: ComplaintStatus; reopened: boolean; closedAt: Date | null }, at: Date): "INVALID_COMPLAINT_STATUS" | "REOPEN_WINDOW_PASSED" | null {
  if (c.reopened || !nextStatus(c.status, "REOPEN") || !c.closedAt) return "INVALID_COMPLAINT_STATUS";
  return at.getTime() - c.closedAt.getTime() > REOPEN_WINDOW_MS ? "REOPEN_WINDOW_PASSED" : null;
}

/** C7 / G13: own comment, not hidden, within 15 minutes. */
export function canEditComment(c: { authorId: string; createdAt: Date; hiddenAt: Date | null }, userId: string, at: Date): "FORBIDDEN" | "EDIT_WINDOW_PASSED" | null {
  if (c.authorId !== userId || c.hiddenAt) return "FORBIDDEN";
  return at.getTime() - c.createdAt.getTime() > COMMENT_EDIT_MS ? "EDIT_WINDOW_PASSED" : null;
}

/** C1 + §12.3 list order: Open (oldest first), In review (oldest first), then closed (newest first). */
export const LIST_ORDER: readonly { statuses: readonly ComplaintStatus[]; newestFirst: boolean }[] = [
  { statuses: ["OPEN"], newestFirst: false },
  { statuses: ["IN_REVIEW"], newestFirst: false },
  { statuses: ["RESOLVED", "REJECTED", "WITHDRAWN"], newestFirst: true },
];

/** C2: "Question about {item} · {month}" when raised from an item. */
export function prefillTitle(locale: "bn" | "en", item: string, month: string | null): string {
  const what = month ? `${item} · ${month}` : item;
  return locale === "bn" ? `${what} নিয়ে প্রশ্ন` : `Question about ${what}`;
}

/**
 * C1 unread dot / §11 badge: the viewer takes part (author or commenter) and
 * someone else commented after they last saw the thread or last commented.
 */
export function isUnseen(
  v: { isAuthor: boolean; createdAt: Date; lastSeenAt: Date | null; ownLastCommentAt: Date | null },
  othersCommentTimes: readonly Date[],
): boolean {
  const marks = [v.lastSeenAt, v.ownLastCommentAt, v.isAuthor ? v.createdAt : null].filter((d): d is Date => d !== null);
  if (!v.isAuthor && !v.ownLastCommentAt) return false;
  const since = Math.max(...marks.map((d) => d.getTime()));
  return othersCommentTimes.some((t) => t.getTime() > since);
}

/** Rule 13 / §11: who besides the complainant hears about a resolution. */
export function resolutionAudience(c: { visibility: ComplaintVisibility; aboutAdmin: boolean }): "ALL_MEMBERS" | "COMPLAINANT" {
  return c.visibility === "ALL" || c.aboutAdmin ? "ALL_MEMBERS" : "COMPLAINANT";
}
