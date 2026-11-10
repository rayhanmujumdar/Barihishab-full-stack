// Home "Latest activity" ordering (Home PRD F8, Rule 5). Pure: each source is
// already filtered (no voided rows) and limited; this merges them.

/** Rows shown on Home. */
export const ACTIVITY_LIMIT = 6;

type Dated = { date: string; createdAt: string };

/** Newest first by date, then by creation time; stable for full ties; at most `limit`. */
export function mergeActivity<T extends Dated>(lists: readonly (readonly T[])[], limit = ACTIVITY_LIMIT): T[] {
  return lists
    .flat()
    .sort((a, b) => (a.date === b.date ? (a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1))
    .slice(0, limit);
}
