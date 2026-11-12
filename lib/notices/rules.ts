// Notice rules (Notices & Complaints PRD N1, N3, N4, G2, Rule 6; design D3, D4).
// Pure: dates are Asia/Dhaka `YYYY-MM-DD` strings supplied by the caller.

/** Effectively pinned: pinned, not archived, and today is on or before Pin until (D4: no job flips the flag). */
export function isPinnedOn(n: { pinned: boolean; pinUntil: string | null; archivedAt: Date | null }, today: string): boolean {
  return n.pinned && !n.archivedAt && (n.pinUntil === null || today <= n.pinUntil);
}

/** Pinned first (newest first), then the rest newest first (N1). */
export function orderNotices<T extends { pinnedNow: boolean; publishedAt: Date }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => Number(b.pinnedNow) - Number(a.pinnedNow) || b.publishedAt.getTime() - a.publishedAt.getTime());
}

export type RemindRefusal = "NOT_URGENT" | "NOTICE_ARCHIVED" | "REMINDER_ALREADY_SENT";

/** Remind unread: urgent, live, at most once per notice per Dhaka day (N4). `null` = allowed. */
export function canRemind(n: { priority: "NORMAL" | "URGENT"; archivedAt: Date | null; lastRemindedOn: string | null }, today: string): RemindRefusal | null {
  if (n.archivedAt) return "NOTICE_ARCHIVED";
  if (n.priority !== "URGENT") return "NOT_URGENT";
  if (n.lastRemindedOn === today) return "REMINDER_ALREADY_SENT";
  return null;
}
