## 0. Preconditions

- [x] 0.1 Confirm `add-home-dashboard` is committed or archived, or rebase onto it. It also edits `app/[lang]/(app)/page.tsx` and `layout.tsx` (design Risks).

## 1. Primitives (test-first)

- [x] 1.1 Write failing UI tests in `components/skeletons/skeletons.test.tsx` for the primitives. `Skeleton` renders `aria-hidden` and has no focusable descendants. `SkeletonRegion` sets `aria-busy="true"` + `aria-label`. `SkeletonStats({cells:5})` renders 5 `.stat` cells inside `.stats`. `SkeletonRows({rows:6})` renders 6 `.list-row` items. `SkeletonTable` renders header + N body rows inside an `overflow-x-auto` wrapper. `SkeletonTabs` has the `border-b-2 border-foreground` rule.
- [x] 1.2 Implement `components/skeletons/primitives.tsx` (D3): `Skeleton`, `SkeletonRegion`, `SkeletonPageHead`, `SkeletonSectionHead`, `SkeletonStats`, `SkeletonRows`, `SkeletonTable`, `SkeletonTabs`, `SkeletonCardGrid`. No hooks, no `"use client"`, no server-only imports. Make 1.1 pass.
- [x] 1.3 CSS (D6): add explicit `border-radius:0` + `pointer-events:none` to `.skeleton`, and add `.skeleton-region` (`user-select:none; min-width:0`) in `app/globals.css`. Tokens only.

## 2. i18n

- [x] 2.1 Add the `loading.*` aria-label keys from D5 to `lib/i18n/en.ts` and `lib/i18n/bn.ts`. Run `lib/i18n/i18n.test.ts` (key parity) and keep it green.

## 3. Page skeletons (test-first)

- [x] 3.1 Write failing UI tests: each page skeleton renders one `aria-busy` region with the locale's label (en + bn), and each one's structural markers match the spec. Owners: owner-card grid + section head + rows. Owner detail: 5 stat cells + table. Distribution: page-head action + month-picker placeholder + staircase stats + owner rows. Advances: 4 stat cells + tabs + 2-col filter row + stacked loan cards. Requests: tabs with the ink rule + stacked request cards. Users: table. Settings: section heads + rows. Profile: field grid + session rows. Home wrapper: head + block placeholders. Auth form: label bars + 44px input bars + full-width button bar. Print statement: header + table. Generic `PageSkeleton`: head + rows.
- [x] 3.2 Implement `components/skeletons/pages.tsx` (D4) from primitives only, reusing the real layout classes (`.page-stack`, `.owner-grid`, `.stats`, `.grid-2`, `.section-head`, `.month-picker`, `.list-row`). Make 3.1 pass.
- [x] 3.3 Rebuild `components/entries/EntriesSkeleton.tsx` on the primitives (same export). Add a test that asserts exactly 6 rows (§6.1, LST-01..05).

## 4. App shell skeleton (test-first)

- [x] 4.1 Write a failing UI test: `ShellSkeleton` renders a `.sidebar` placeholder (brand square, nav bars, avatar footer), a `.topbar` placeholder, a `.bottom-nav` placeholder with 5 cells, and a `PageSkeleton` in `.shell-main`, with no focusable elements.
- [x] 4.2 Implement `ShellSkeleton` (D2). Make `AppLayout` in `app/[lang]/(app)/layout.tsx` `async`, read `getLocale()` before the `<Suspense>`, and use `<ShellSkeleton locale>` as its fallback.

## 5. Wire page fallbacks

- [x] 5.1 Swap the fallbacks: `owners/page.tsx` → `OwnersSkeleton`; `owners/[id]/page.tsx` → `OwnerDetailSkeleton`; `requests/page.tsx` → `RequestsSkeleton`; `distribution/page.tsx` → `DistributionSkeleton`; `advances/page.tsx` → `AdvancesSkeleton`.
- [x] 5.2 Replace the `null` fallbacks: `admin/users/page.tsx` → `UsersSkeleton`; `settings/page.tsx` → `SettingsSkeleton`; `me/page.tsx` → `ProfileSkeleton`. Each page reads `getLocale()` outside the boundary to pass `locale`.
- [x] 5.3 Home wrapper: `(app)/page.tsx` fallback → `HomeSkeleton`. Leave the per-block `BlockSkeleton` unchanged.
- [x] 5.4 Auth: replace the `FormSkeleton` body in `components/auth/AuthHeading.tsx` with `AuthFormSkeleton` (login, forgot, invite, reset). Pass the locale from each page.
- [x] 5.5 Print: `(print)/owners/[id]/statement/print/page.tsx` and `(print)/loans/[id]/statement/print/page.tsx` fallbacks → `StatementPrintSkeleton`.

## 6. Overlay skeletons (test-first)

- [x] 6.1 Write failing tests in the existing suites. `components/entries/entries.test.tsx`: the Detail drawer with a pending detail query shows `DetailDrawerSkeleton` and no visible "Loading…" kicker; Generate-rent with a pending preview shows `RentPreviewSkeleton`. Add a Close-month dialog test with a pending preview that shows `ClosePreviewSkeleton` and keeps the primary action disabled.
- [x] 6.2 Implement the D7 changes in `components/entries/DetailDrawer.tsx` (sr-only `SheetTitle` while loading), `components/entries/GenerateRentDialog.tsx` and `components/distribution/CloseMonthDialog.tsx`. Make 6.1 pass.
- [x] 6.3 Delete any i18n key that is now unused (only if no other reference remains). Re-run the i18n parity test.

## 7. End-to-end & visual verification

- [x] 7.1 Add e2e `e2e/skeletons.spec.ts`. Delay the page's RSC stream with route interception or a slow request, then for `/en/owners`, `/en/owners/<id>`, `/bn/distribution`, `/en/advances`, `/en/requests`, `/en/admin/users`, `/en/settings` and `/en/me` assert: a visible `[aria-busy="true"]` region with a label, no visible "Loading…" paragraph, and the region gone once the content loads.
- [x] 7.2 In the same spec, cover the shell: hard-load at 1280px (sidebar placeholder 252px wide) and at 375px (no sidebar, 5-cell bottom nav fixed to the bottom). Also check 360px has no horizontal scroll, and that `prefers-reduced-motion: reduce` leaves skeleton blocks with `animation-name: none`.
- [x] 7.3 Check design tokens in e2e: every `.skeleton` element has a computed `border-radius` of `0px`, `box-shadow: none`, and the neutral-200 background.
- [x] 7.4 Visual check with playwright-cli. Screenshot each skeleton next to its loaded page at 1280px and 375px (save under `.context/`) and confirm the head, rules and grids line up with no big layout shift. Fix any drift.

## 8. Quality gates

- [x] 8.1 `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test` (unit + ui + integration) and the new e2e spec all pass. Run the existing e2e suites that use `getByText("Loading…")` and update any assertion that relied on the old text.
- [x] 8.2 `pnpm build` succeeds with no "uncached data accessed outside of `<Suspense>`" error from the now-async `AppLayout`, and both `/en` and `/bn` app shells still prerender.
- [x] 8.3 No API changes in this change: confirm `/api/v1/openapi.json` is unchanged (no Swagger registration needed).
