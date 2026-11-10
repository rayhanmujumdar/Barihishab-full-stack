## Why

Most screens show a bare "Loading…" line (Owners, Owner detail, Requests, Distribution, Advances & loans) or nothing at all (Users, Settings, Profile, the app shell, print statements) while their server data streams in. The page then jumps from a single line of text to a full layout, which feels slow and shifts content. Income & expenses (§6.1, "6 skeleton rows") and Home (Home PRD F11) already use skeletons. This change brings every other page up to the same standard.

## What Changes

- Add a small set of shared skeleton primitives (`Skeleton`, `SkeletonText`, `SkeletonStats`, `SkeletonRows`, `SkeletonTable`, `SkeletonCardGrid`, `SkeletonPageHead`), built on the existing `.skeleton` token class (neutral-200 fill, zero radius, pulse that stops under `prefers-reduced-motion`).
- Add one page-level skeleton per screen. Each one copies the real page's structure: kicker + H1 head, month picker, stat grid with its 2px ink top rule, owner card grid, request tabs + cards, staircase + owner board, tables, list rows, and the form panels.
  - Owners list, Owner detail, Requests, Distribution, Advances & loans: replace the "Loading…" text fallback.
  - Users, Settings, Profile (`/me`), Home page wrapper, print statements: replace the `null` or empty fallback.
  - Income & expenses: refactor `EntriesSkeleton` onto the shared primitives. It still shows 6 rows (§6.1, unchanged).
  - Auth forms (login, forgot, invite, reset): replace the blank 320px `FormSkeleton` with a field-shaped skeleton.
- Add an **app-shell skeleton** for the `(app)` layout fallback: sidebar ≥860px, top bar, and bottom nav <860px. A hard load no longer flashes an empty page before the session resolves.
- Replace the in-place "Loading…" text inside overlays with matching skeletons: entry Detail drawer (`detail.loading`), Close-month dialog preview (`dist.close.loading`), Generate-rent dialog preview (`common.loading`).
- Every skeleton has an accessible name and `aria-busy="true"`, in English and Bangla (i18n keys reused or added in `en.ts` / `bn.ts`).
- No data, API, permission or accounting behaviour changes.

PRD coverage: main PRD §6 design system ("Design system… i18n skeleton", build-order step 2); Income & Expenses PRD §6.1 S3 loading state (6 skeleton rows, kept); Home PRD F11 (skeleton blocks, kept and extended to the page wrapper). The PRD names no loading state for the Owners, Distribution, Advances & loans, Requests, Users, Settings and Profile screens, so this change adds the same convention there as a UX improvement. Nothing in the PRD conflicts with it.

### Out of scope

- Spinners or skeletons for **mutations** (button `busy` / `isPending` states stay as they are).
- Skeletons for "Load more" pagination (`isFetchingNextPage`). The existing disabled-button behaviour stays.
- Skeletons during **same-page transitions** (tab, filter or month changes that keep the old UI visible via router transitions).
- Upload progress UI (attachment / avatar "Uploading…" labels stay).
- Changing the Home block skeletons (`BlockSkeleton`), which belong to the in-progress `add-home-dashboard` change. Only the outer page wrapper fallback is added here.
- New `loading.tsx` route files (see design D1).

## Capabilities

### New Capabilities
- `loading-skeletons`: the shared skeleton primitives, the rule that every app/auth/print page and data-loading overlay shows a skeleton matching its layout (never bare "Loading…" text or a blank area), the app-shell skeleton, and accessibility, motion and design-token requirements.

### Modified Capabilities
<!-- None: entries-ui already requires 6 skeleton rows (LST-01..05, §6.1); the refactor keeps that behaviour. Home skeletons stay owned by add-home-dashboard. -->

## Impact

- **New**: `components/skeletons/*` (primitives + per-page skeletons), UI tests in `components/skeletons/skeletons.test.tsx`.
- **Edited fallbacks**: `app/[lang]/(app)/{layout,page,owners/page,owners/[id]/page,requests/page,distribution/page,advances/page,admin/users/page,settings/page,me/page,entries/page}.tsx`, `app/[lang]/(auth)/*/page.tsx` (via `components/auth/AuthHeading.tsx` `FormSkeleton`), `app/[lang]/(print)/**/print/page.tsx`.
- **Edited overlays**: `components/entries/DetailDrawer.tsx`, `components/entries/GenerateRentDialog.tsx`, `components/distribution/CloseMonthDialog.tsx`.
- **Refactor**: `components/entries/EntriesSkeleton.tsx` moves onto the shared primitives.
- **CSS**: small additions in `app/globals.css` (skeleton shell / sizes) using tokens only.
- **i18n**: loading labels in `lib/i18n/en.ts` + `bn.ts`.
- **Coordination**: `app/[lang]/(app)/page.tsx` and `layout.tsx` are also touched by the uncommitted `add-home-dashboard` change. Land this change after that one, or rebase onto it.
- No API, Swagger, DB or permission changes.
