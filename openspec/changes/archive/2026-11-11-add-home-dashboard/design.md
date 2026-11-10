## Context

Home today (`app/[lang]/(app)/page.tsx` → `components/app/HomeDesk.tsx`) is one Server Component that awaits a handful of Prisma counts and renders one client-free view. Every number the Home PRD asks for already has a read model elsewhere:

| Home figure | Existing source |
| --- | --- |
| Owner balance, label, share % | `balancesByOwner` (`lib/owners/owner-service.ts`), `balanceLabel` / `sharePercent` (`lib/accounting/owners.ts`) |
| Entitlement preview, received, advances (month) | Distribution board row (`getDistribution` → `boardFor`, `lib/distribution/distribution-service.ts`) |
| Staircase, Draft, previous deficit | `computeMonth` / `staircaseDto` (`lib/distribution/month-data.ts`) |
| Loan outstanding, next deduction | `activeLoans` (`lib/loans/loan-service.ts`), `loanDeductions` (`lib/accounting/distribution.ts`) |
| House fund + accounts | `listFunds` / `houseFundBalance` (`lib/master-data/fund-service.ts`) |
| Reserve balance | `reserveBalance` (`lib/distribution/reserve-service.ts`) |
| Close reminder, unpaid units | `closeReminder` / `unpaidUnitsIn` (`distribution-service.ts`) |
| Pending requests, approved-overdue, owner's open request, unseen decision | `requestReminders`, `latestOpenRequest`, `decisionUnseen` (`lib/requests/*`) |
| Rent preview | `previewRent` (`lib/transactions/transaction-service.ts`) |

Constraints: Next.js 16.4 App Router with Cache Components (`await connection()` in GET handlers), `catchError` from `next/error` for component-level error boundaries (see `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/catchError.md`), shadcn/ui + Heroicons only, design-system skill, money in integer paisa, accounting formulas in the pure `lib/accounting` module with full test coverage.

## Goals / Non-Goals

**Goals:**
- Zero new accounting rules on Home: every figure is a call into the same function its detail page uses (Rule 2, "0 numbers differ").
- Each block streams and fails on its own (F11) using RSC + Suspense + `catchError`, no client data-fetching layer for Home.
- One role-aware `GET /api/v1/dashboard` built from the same block loaders, so the API and the page cannot drift.
- Keep Home cheap: one `computeMonth` per request shared by hero, this-month and staircase.

**Non-Goals:**
- Notices storage, complaint threads, email-failure tile (P2), reconciliation against an entered cash count (P2).
- Caching Home data across requests (`"use cache"`); figures must be fresh after every write.

## Decisions

### D1 — `lib/home/` block loaders, memoised per request with `React.cache`
One module per block: `month.ts` (current month + house name + firstMonth), `me.ts`, `desk.ts`, `reminders.ts`, `activity.ts`, `setup.ts`, `notices.ts`, plus `dashboard.ts` that assembles the API payload. Shared inputs (`homeMonth(propertyId)` → periods, index, `computeMonth` result; `viewerOwner(propertyId, userId)`) are wrapped in `cache()` so several Suspense blocks in one render reuse one DB round-trip.
*Alternative:* call `getDistribution` for each block — rejected: it builds the whole board, reopen history and changes diff; Home needs the staircase and one row.
*Refactor needed:* the hero/this-month call the pure `boardRows` (`lib/accounting/distribution.ts`) with just the viewer's month entries, so they use the exact board-row math without a new service export; `unpaidUnitsIn` is exported from `distribution-service.ts` for the Rent status reminder and Generate-rent availability.

### D2 — RSC blocks + Suspense + `catchError` (no TanStack Query on Home)
`page.tsx` renders `<HomeHeader/>` then each block as `<BlockBoundary name="activity"><Suspense fallback={<BlockSkeleton/>}><ActivityBlock/></Suspense></BlockBoundary>`. `BlockBoundary` is a `"use client"` `catchError(fallback)` whose fallback shows "Couldn't load {block}. Try again" and calls `retry()` (re-fetches just that segment in a transition).
*Alternative:* client blocks with `useQuery` per `/api/v1/dashboard/<block>` — more endpoints, a loading waterfall after hydration, duplicated DTO mapping. Rejected; RSC streaming gives independent loading with no extra endpoints.
Interactive bits are small client islands: `QuickActions` (opens drawers), `ReconciliationDetails` (dialog), `ReminderStrip` (Hide today), `NoticeBody` (Read more clamp), `HomeRefresh` (visibility + pull-to-refresh).

### D3 — Freshness via `router.refresh()`
Existing sections refresh server data with `router.refresh()` after mutations (`DistributionView`, `EntriesView`, `RequestsView`). Home does the same: drawer `onSaved` → `router.refresh()`. `HomeRefresh` listens to `visibilitychange` (refresh when hidden ≥ 5 min) and a lightweight touch handler (pull ≥ 64px while `scrollY === 0`, mobile only) and shows "Updated just now" for 3 s after the refresh transition settles. No new dependency.

### D4 — Quick actions reuse Entries dialogs through a narrower prop type
`EntryDrawer` and `GenerateRentDialog` take `data: EntriesData` but only read `month, status, latestOpen, periods, categories, units, funds`. Introduce `type EntryFormData = Pick<EntriesData, …>` and type both components with it (EntriesView still passes its full object — structurally compatible, no behaviour change). Home's `QuickActions` server wrapper loads `listCategories / listUnits / listFunds / listPeriods` only for `dashboard.admin`, and imports the drawers with `next/dynamic` so owners never download them.

### D5 — Reconciliation is a pure function
`lib/accounting/reconciliation.ts`: `reconcile({ fundPaisa, ownerBalancesPaisa, reservePaisa, openNetPaisa, deficitCarriedPaisa, loansOutstandingPaisa }) → { status, expectedPaisa, mismatchPaisa, parts }`. Inputs gathered in `lib/home/desk.ts`:
- `fundPaisa` = `houseFundBalance` (active accounts — PRD "House fund total equals the sum of active fund accounts").
- `ownerBalancesPaisa` = Σ `balancesByOwner`.
- `reservePaisa` = `reserveBalance` (starting + kept in closed months − reserve-paid expenses, all months).
- `openNetPaisa` = Σ over OPEN periods of `income − expensePaisa` from `periodTotals` (`expensePaisa` already excludes from-reserve expenses, which `reservePaisa` covers).
- `deficitCarriedPaisa` = latest CLOSED snapshot's `deficitCarriedPaisa`.
- `loansOutstandingPaisa` = Σ `activeLoans(...).outstandingPaisa`.
Why it balances: loan disbursal lowers the fund and raises loans (cancels); loan deduction on close lowers an owner balance and the loan (cancels, no cash — TC-08); payout/advance lowers fund and balance; void reversals restore both (TC-12). Tests cover each move against a balanced fixture.
*Known gap (documented, not hidden):* an inactive fund account with a non-zero balance can't exist (`FUND_NOT_EMPTY` guard); owner ADJUSTMENT entries with no fund move are real ledger corrections and *should* surface as a mismatch until offset.

### D6 — Latest activity: bounded per-source fetch, merge in memory
Query the 6 newest from each source (non-voided income/expense; PAYOUT/ADVANCE ledger entries with `voidedAt: null` and type not REVERSAL; loans not CANCELLED; `loanMovement` CASH_REPAYMENT not reversed), map to a common `ActivityItem`, then a pure `mergeActivity(lists, 6)` sorts by (date desc, createdAt desc) and slices. Six-row `take` per source keeps it O(1) and index-friendly. "Reversed repayment" = a REVERSAL movement referencing it — mirror the rule already used by Advances & Loans' repayment list.

### D7 — Reminder timing in a pure module
`lib/accounting/home-reminders.ts`: `pickReminders({ today, openMonths, currentMonthOpen, unpaidUnits, approvedOverdue }) → Reminder[]` applies G4 timing (CLOSE_MONTH when today's month > an open month; RENT_STATUS from day 10 of the current open month), priority order and the cap of two. Approved-overdue reuses `reminderKinds` from `lib/accounting/requests.ts`. Pending-over-3-days is shown on the Pending requests tile instead of a strip (keeps the two-strip cap meaningful).

### D8 — "Hide today" is a cookie, not a table
Clicking **Hide today** writes `bh_home_hidden=<kind>:<yyyy-mm-dd>,…` (Asia/Dhaka date, path `/`, `SameSite=Lax`, 2-day max-age) and hides the strip locally; the server reminders block reads the cookie via `cookies()` and filters out kinds hidden for *today*, so a reload never flashes the strip. Per-device is acceptable for a nudge; no migration.
*Alternative:* `user.settings` JSON — survives devices but adds a write endpoint and audit row for a cosmetic preference. Rejected for P1.

### D9 — Notices seam
`lib/home/notices.ts` exports `pinnedNotices(propertyId, userId) → { items: NoticeDto[]; more: boolean }` and `openComplaintsCount(propertyId) → number`, both returning empty/0 today. The Notices & Complaints change replaces their bodies; Home UI, API schema and tests already handle real data (UI tests use fixtures with urgent/unread items).

### D10 — API shape
`app/api/v1/dashboard/route.ts` → `withAuth` (any logged-in user), `await connection()`, `ok(await dashboard(viewer), { headers: { "Cache-Control": "no-store" } })`. `schema.ts` defines `DashboardResponseSchema` (zod, registered in `openapi.ts`). Role gating happens inside `dashboard()` using `can(viewer, "dashboard.admin")` and the viewer's owner link — the same gates the page uses, so tests on the endpoint also prove the page's visibility rules.

### D11 — Shell
- `layout.tsx` loads the property name (one `findUnique`, cached) and passes `houseName` + `primaryAction` (`"entry" | "request" | null`) to the shell.
- `components/app/nav.ts` holds the nav items and `bottomNav(viewer)` — a pure function returning the 4 visible slots per spec (admin: Home, Entries, [+], Distribution; others: Home + first three permitted of Owners-as-"Accounts", Requests, Entries, Advances); everything else, plus Log out, goes into a shadcn `Sheet` (side="bottom") opened by **More**. The existing `useLogoutConfirm` dialog is reused.
- `[+]` and **+ New entry** link to `/entries?new=EXPENSE`; **+ Request money** links to `/requests?new=1`. `EntriesView` / `RequestsView` read `new` on mount, open their dialog, and `router.replace` without it on close.
- Month picker: there is none in the top bar today, so G1 needs no removal.
- The owner's "Accounts" slot is labelled «আমার হিসাব» in বাংলা so it isn't confused with the Entries short label «হিসাব».
- The e2e story is `e2e/summary-home.spec.ts` so it sorts after `requests.spec.ts` and before `visual.spec.ts` on the shared test DB.

### D12 — Deviations from the PRD
- **Owner bottom nav** (PRD: Home · Accounts (Reports) · Requests · Notices · More): Reports and Notices don't exist, so the "Accounts" slot points to Owners (the owner's own statement is one tap away) and the Notices slot falls back to the next permitted section. Swaps automatically when those sections ship.
- **Main PRD S2 "last 5 transactions"** vs Home PRD "6": Home PRD wins (it is the user-named source).
- **Pending over 3 days** is a tile sub-line, not a fourth reminder strip (F6 lists three kinds; max two show).
- **Hide today** is per device (D8).
- **Email problems (G10)** deferred to P2 as the PRD's phase table says.

## Risks / Trade-offs

- [Home render cost: fund movements + balances + computeMonth + activity on every load] → per-request `cache()`, parallel `Promise.all` inside each block, bounded `take: 6` queries; e2e asserts first paint < 3 s locally.
- [Reconciliation shows CHECK on existing dev/seed data whose opening balances don't line up] → that is the feature working; seed scripts get a fixture that balances, and the breakdown dialog makes the cause visible.
- [Bottom-nav change breaks existing e2e that tap items like Owners/Requests directly at mobile width] → update those specs to go through More; shell UI tests cover both role layouts.
- [Uncommitted Requests files in this worktree vs `origin/development`] → first task syncs the branch before code changes.
- [`catchError` is new API surface] → isolated in one `BlockBoundary` component with a UI test that forces a throw.

## Migration Plan

No schema migration. Deploy is code-only; rollback = revert the commit. Swagger regenerates from `openapi.ts`.

## Acceptance check (Home PRD §10) — known gaps

Verified by tests and on the dev server: every Owner, Super Admin and Everyone box, except:
- **Pinned notices / Open complaints** show the empty seam (no Notices section yet — user decision); urgent/unread rendering is covered by UI tests only.
- **First load under 3 s on 4G** was not measured with throttling; blocks stream independently and each loader is bounded (≤ 6 rows per source).
- **Open complaints** tile has no link yet (no Notices & complaints page to open).

