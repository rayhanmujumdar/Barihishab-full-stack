## Context

Every app page is a sync/async `page.tsx` that reads `getLocale()` (a root param from `generateStaticParams`, so it can be prerendered) and then renders `<Suspense fallback={…}><Data/></Suspense>`. The async `Data` component does the permission check and the reads. Under `cacheComponents: true` + `partialPrefetching: true`, the part outside the boundary (including the fallback) is the prerendered static shell that the client prefetches. That is why the fallback shows at once on navigation. Today the fallbacks are:

| Page | Fallback today |
|---|---|
| `(app)/layout.tsx` shell | `<div className="shell" aria-busy>` (empty) |
| Home `page.tsx` wrapper | `<div className="home" aria-busy>` (empty); blocks use `BlockSkeleton` |
| Entries | `EntriesSkeleton` (6 rows), already done |
| Owners, Owner detail | `<p class="muted">Loading owners…</p>` |
| Requests, Distribution, Advances | `<p class="muted">Loading…</p>` |
| Users, Settings, Profile, print statements | `null` |
| Auth forms | `FormSkeleton` = blank 320px box |
| Overlays | Detail drawer kicker "Loading…", Close-month "Checking the month…", Generate-rent "Loading…" |

A `.skeleton` class already exists in `app/globals.css` (neutral-200 fill, opacity pulse, disabled under reduced motion). Layout classes the skeletons can reuse: `.page-stack`, `.section-head`, `.stats`/`.stat`, `.owner-grid`/`.owner-card`, `.grid-2`, `.list-row`, `.month-picker`, `.shell`/`.sidebar`/`.topbar`/`.bottom-nav`, `.shell-main`.

## Goals / Non-Goals

**Goals:**
- One shared primitive set, so every page skeleton looks the same and costs little to keep up.
- Skeletons are server-renderable *and* client-importable (no hooks, no `"use client"`, no server-only imports). Pages use them as RSC fallbacks and client overlays use them inline.
- Reuse the real layout classes so the content swap barely shifts the layout (CLS ≈ 0 on the page head and grids).

**Non-Goals:**
- Pixel-exact replicas. Skeletons copy the structure (head, rules, grids, row counts and heights), not every field.
- Changing how data is fetched or where Suspense boundaries sit.

## Decisions

### D1. Keep the existing per-page `<Suspense>` boundaries; swap the fallback. No `loading.tsx`.
Each page already owns exactly one boundary, and its fallback is prerendered and prefetched. Adding `loading.tsx` would put a *second* boundary around the same page. That shows two skeletons in a row (the route skeleton, then the in-page one) or forces us to delete the in-page boundaries, which Cache Components needs around the runtime reads. Swapping the fallback is a one-line change per page.
*Alternative*: `loading.tsx` per segment. Rejected: duplicate boundary, and `loading.tsx` takes no props, so it would have to re-derive the locale.

### D2. App-shell skeleton in the `(app)` layout fallback; the layout reads the locale first.
`AppLayout` becomes `async` and calls `await getLocale()` before its `<Suspense>`, the same pattern the pages use. It passes the locale to `<ShellSkeleton locale>`. The skeleton reuses `.shell` / `.sidebar` / `.topbar` / `.bottom-nav`, so the breakpoint (860px) and sizes (252px sidebar, 60px nav cells) come from the same CSS as the real shell and cannot drift. Its main area renders `<PageSkeleton>` (generic head + rows). This only shows on a hard load or a first entry into `(app)`. Client navigation keeps the real shell mounted and shows only the page's fallback.
*Alternative*: CSS-only empty shell borders. Rejected: still reads as a blank page.

### D3. Primitive API (`components/skeletons/primitives.tsx`)
- `Skeleton` is a `<span aria-hidden className="skeleton block …">` with a `className` passthrough for width/height (Tailwind sizes).
- `SkeletonRegion({ label, className, children })` is the only element with `role="status"` + `aria-busy="true"` + `aria-label={label}`. The role is required: ARIA 1.2 does not allow `aria-label` on a role-less (generic) `div`, so screen readers would skip the name. `aria-busy` keeps the live region quiet while it is shown. This matches `BlockSkeleton` on Home.
- `SkeletonPageHead({ action? })`: kicker bar (h-3 w-24) + title bar (h-10, clamp width) inside the same flex row the pages use, plus an optional 44px button placeholder on the right.
- `SkeletonStats({ cells })`: `.stats` container (2px ink top rule, divider cells) with a kicker bar + 26px value bar per cell.
- `SkeletonRows({ rows, meta? })`: `<ul>` of `.list-row` items (44px min-height), with a left text bar and a right money bar.
- `SkeletonTable({ cols, rows })`: same `.st-wrap` frame and min-width as the real table, but clipped (`overflow:hidden`) rather than scrollable, because placeholders have no focus target. It has an uppercase-height header row with a 2px divider and 1px row rules.
- `SkeletonSectionHead()`: `.section-head` with a title bar (keeps the 2px ink bottom rule).
- `SkeletonTabs({ tabs })`: a flex row of 44px bars over a `border-b-2 border-foreground` rule.
- `SkeletonCardGrid({ cards, variant })`: reuses `.owner-grid` / `.owner-card` for owners. For requests and loans it renders the same stacked `<ul>` (gap 16px) the real pages use, with each card an unfilled frame (2px ink top rule) holding bars. Neutral-200 bars barely show on the surface fill, so the fill is dropped.

All blocks are `<span>`/`<div>` with no interactive elements. Real control heights are kept: `min-h-11` (44px) rows/inputs, `h-12` (48px) CTAs.

### D4. One skeleton per page (`components/skeletons/pages.tsx`), composed only from primitives
`ShellSkeleton`, `PageSkeleton` (generic), `HomeSkeleton`, `OwnersSkeleton`, `OwnerDetailSkeleton`, `DistributionSkeleton`, `AdvancesSkeleton`, `RequestsSkeleton`, `UsersSkeleton`, `SettingsSkeleton`, `ProfileSkeleton`, `AuthFormSkeleton`, `StatementPrintSkeleton`, plus overlay bodies `DetailDrawerSkeleton`, `ClosePreviewSkeleton`, `RentPreviewSkeleton`. Each page skeleton takes `{ locale }` and builds its own label with `translator(locale)`. The shapes are listed in the spec ("Skeleton mirrors the real page layout"). `EntriesSkeleton` keeps its file and export (the import site in `entries/page.tsx` stays), but its body is rebuilt from primitives with exactly 6 rows.

### D5. i18n: reuse existing labels, add only what's missing
Reuse `entries.loading`, `owners.loading`, `common.loading`, `detail.loading`, `dist.close.loading`. Add page-specific labels to both `en.ts` and `bn.ts`: `loading.app`, `loading.home`, `loading.owner`, `loading.distribution`, `loading.advances`, `loading.requests`, `loading.users`, `loading.settings`, `loading.profile`, `loading.form`, `loading.statement`, `loading.rentPreview`, `loading.entry`. These are used only as `aria-label` text, not shown on screen. The existing i18n parity test (en/bn key sets equal) protects them.

### D6. CSS: tokens only, minimal additions
`.skeleton` gets `border-radius:0` (explicit, guarding against Tailwind `rounded` leaking in) and `pointer-events:none`. A `.skeleton-region` sets `user-select:none` and `min-width:0`. No new colors. The pulse stays opacity-only. The existing `prefers-reduced-motion` rule already turns the animation off.

### D7. Overlays
- Detail drawer: while the detail query is pending, the header shows kicker/title bars and the body shows `DetailDrawerSkeleton` (amount, tags, 5 key/value rows, files, history), in a region labelled "Loading the entry…" (`loading.entry`). `SheetTitle` must exist for Radix a11y, so it stays as an sr-only "Loading…" and gives the dialog its name. A failed fetch shows the error strip without placeholder bars.
- Close-month dialog: while the preview query is pending, replace the "Checking the month…" paragraph with `ClosePreviewSkeleton`, which copies the real body: a kicker + 4 icon/text check rows, then a kicker + 3 "what happens" lines. Its region is labelled with the old text. The primary button stays disabled until the preview arrives, as it does today. A failed preview shows only the error strip.
- Generate-rent dialog: `rows === null` shows `RentPreviewSkeleton` (unit rows with right-aligned amount bars).

No PRD deviation: the PRD names skeletons only for Entries (§6.1) and Home (F11). Using them elsewhere adds to the PRD and does not change any rule in it.

## Risks / Trade-offs

- **Coordination with the uncommitted `add-home-dashboard` change** (it also edits `(app)/page.tsx` and `layout.tsx`) → implement after it lands, or rebase. Tasks touch only the fallback lines.
- **Skeleton drift when a page's layout changes later** → skeletons reuse the real layout classes, and UI tests assert the structural markers (stat cell count, row count, tab rule), so a big drift fails a test.
- **Making `AppLayout` async could pull runtime data out of the static shell** → `getLocale()` reads only the static root param (the pages already do this). The e2e/visual check confirms the shell skeleton paints before the session resolves, and `next build` must still prerender `/en` and `/bn` shells with no "uncached data outside Suspense" error.
- **Hidden flicker on fast loads** → no artificial delay is added. When data streams fast, the skeleton is replaced in the same paint, which is acceptable. A minimum display time would make the app feel slower.
- **Screen readers** → only the region carries `aria-busy` + a label. Blocks are `aria-hidden`, so nothing is read out bar by bar.

## Migration Plan

UI-only and stateless: no DB, API or flag changes. Ship in one PR. Rollback = revert the PR. The old fallbacks are one-line expressions.
