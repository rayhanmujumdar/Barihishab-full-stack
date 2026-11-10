// Loading-skeleton building blocks (loading-skeletons spec, design D3).
// No hooks, no "use client", no server-only imports: pages use these as RSC
// Suspense fallbacks and client overlays render them inline.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** One neutral placeholder bar; sized by the caller with Tailwind classes. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("skeleton block", className)} />;
}

/**
 * The only busy element: a named status (aria-label is not allowed on a
 * role-less div, so screen readers would skip it). aria-busy keeps it quiet
 * until the real content replaces it.
 */
export function SkeletonRegion({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={cn("skeleton-region", className)}>
      {children}
    </div>
  );
}

/** Kicker bar + title bar, the head every page starts with. */
export function SkeletonPageHead({ action = false, sub = false }: { action?: boolean; sub?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-10 w-72 max-w-full" />
        {sub ? <Skeleton className="mt-2 h-4 w-56 max-w-full" /> : null}
      </div>
      {action ? <SkeletonAction /> : null}
    </div>
  );
}

function SkeletonAction() {
  return (
    <span data-skeleton="action" aria-hidden="true" className="skeleton block h-11 w-36" />
  );
}

/** `.section-head` with a title bar (keeps the 2px ink rule). */
export function SkeletonSectionHead({ action = false }: { action?: boolean }) {
  return (
    <div className="section-head">
      <Skeleton className="h-6 w-40" />
      {action ? <Skeleton className="h-9 w-24" /> : null}
    </div>
  );
}

/** Ruled stat grid: kicker bar + 28px value bar per cell. */
export function SkeletonStats({ cells }: { cells: number }) {
  return (
    <div className="stats">
      {Array.from({ length: cells }, (_, i) => (
        <div key={i} className="stat">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2 h-7 w-28" />
        </div>
      ))}
    </div>
  );
}

/** `.list-row` items: text bar on the left, money bar on the right. */
export function SkeletonRows({ rows, meta = false }: { rows: number; meta?: boolean }) {
  return (
    <ul className="m-0 list-none p-0">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="list-row min-h-11">
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-1/2" />
            {meta ? <Skeleton className="h-3 w-1/3" /> : null}
          </span>
          <Skeleton className="h-5 w-20" />
        </li>
      ))}
    </ul>
  );
}

/** Statement-style table: uppercase header row + ruled body rows, the last two columns right-aligned money. */
export function SkeletonTable({ cols, rows, minWidth }: { cols: number; rows: number; minWidth?: number }) {
  const cells = Array.from({ length: cols }, (_, i) => i);
  const isNum = (c: number) => cols > 2 && c >= cols - 2;
  const numClass = (c: number) => (isNum(c) ? "num" : undefined);
  return (
    // Clipped, not scrollable: placeholders have nothing to reach, and a
    // scroll box without a focus target fails keyboard access checks.
    <div className="st-wrap" style={{ overflow: "hidden" }}>
      <table aria-hidden="true" className="st-table" style={minWidth ? { minWidth } : undefined}>
        <thead>
          <tr>
            {cells.map((c) => (
              <th key={c} className={numClass(c)}>
                <Skeleton className={cn("h-3 w-16", isNum(c) && "ml-auto")} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {cells.map((c) => (
                <td key={c} className={numClass(c)}>
                  <Skeleton className={cn("h-4", c === 0 ? "w-24" : isNum(c) ? "ml-auto w-20" : "w-3/4")} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Tab bar placeholder over the 2px ink rule (Requests, Advances & loans). */
export function SkeletonTabs({ tabs }: { tabs: number }) {
  return (
    <div className="flex flex-wrap gap-1 border-b-2 border-foreground">
      {Array.from({ length: tabs }, (_, i) => (
        <Skeleton key={i} className="h-10 w-28" />
      ))}
    </div>
  );
}

/** Label bar + 44px input bar, like a `.field`. */
export function SkeletonField() {
  return (
    <div className="flex flex-col gap-1.5">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

/** Stacked card frames with the 2px ink top rule (loan / request cards). No fill: bars stay visible. */
export function SkeletonCardList({ cards }: { cards: number }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-4 p-0">
      {Array.from({ length: cards }, (_, i) => (
        <li key={i} data-skeleton="card" className="flex flex-col gap-3 border border-t-2 border-[var(--color-divider)] border-t-foreground p-4">
          <span className="flex items-center gap-2">
            <Skeleton className="h-6 w-44 max-w-[60%]" />
            <Skeleton className="h-5 w-16" />
          </span>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-2/3" />
          <span className="flex gap-2">
            <Skeleton className="h-11 w-28" />
            <Skeleton className="h-11 w-24" />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Owner cards in the real `.owner-grid` / `.owner-card` frame. */
export function SkeletonOwnerGrid({ cards }: { cards: number }) {
  return (
    <ul className="owner-grid">
      {Array.from({ length: cards }, (_, i) => (
        <li key={i}>
          <div data-skeleton="owner-card" className="owner-card pb-[18px]" style={{ background: "transparent" }}>
            <span className="flex items-start gap-3">
              <Skeleton className="size-10 flex-none" />
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </span>
              <Skeleton className="h-6 w-12" />
            </span>
            <span className="flex gap-1.5">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-14" />
            </span>
            <span className="flex justify-between gap-3">
              <span className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-7 w-28" />
              </span>
              <span className="flex flex-col items-end gap-1.5">
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-5 w-16" />
              </span>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The 2px-ink month picker frame with prev/next cells (Entries, Distribution). */
export function SkeletonMonthPicker() {
  return (
    <div className="month-picker self-start" aria-hidden="true">
      <span className="grid w-11 place-items-center">
        <Skeleton className="size-5" />
      </span>
      <span className="month-picker-label">
        <Skeleton className="h-4 w-28" />
      </span>
      <span className="grid w-11 place-items-center">
        <Skeleton className="size-5" />
      </span>
    </div>
  );
}
