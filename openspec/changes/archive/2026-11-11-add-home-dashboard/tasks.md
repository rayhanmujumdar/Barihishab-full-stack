## 1. Prep

- [x] 1.1 Sync the branch with `origin/development` (Requests already merged there in 052fe75) so the worktree's uncommitted Requests files don't collide; confirm `pnpm test` and `pnpm exec playwright test` are green before starting
- [x] 1.2 Read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/catchError.md` and the Suspense/streaming guide; read the barihisab-design-system skill

## 2. Pure accounting (test-first)

- [x] 2.1 Write failing unit tests `lib/accounting/reconciliation.test.ts`: balanced fixture; CHECK with −200000 mismatch; loan disbursal, loan deduction on close, payout, advance and payout void each keep a balanced house balanced; parts listed
- [x] 2.2 Implement `lib/accounting/reconciliation.ts` `reconcile()` until 2.1 passes (100% coverage)
- [x] 2.3 Write failing unit tests `lib/accounting/home-reminders.test.ts`: day 9 vs day 10 rent, CLOSE_MONTH on the 1st of next month, APPROVED_UNPAID past needed-by, priority order, cap at two, hidden kinds filtered for today only
- [x] 2.4 Implement `lib/accounting/home-reminders.ts` `pickReminders()` until 2.3 passes
- [x] 2.5 Write failing unit tests for `mergeActivity()` (newest by date then createdAt, limit 6, stable ties) and implement it in `lib/accounting/activity.ts`

## 3. Home read model (integration tests first)

- [x] 3.1 Write failing integration tests `tests/integration/home/home-read.test.ts` with factory data for the PRD §9 worked example: current-month resolution (open / none open / no periods, firstMonth); `me` figures equal `getDistribution` row + `ownerStatement` + `listLoans` for the same owner; voided payout excluded; loan line next deduction
- [x] 3.2 Export the helpers Home needs from existing services without behaviour change: `unpaidUnitsIn` from `lib/distribution/distribution-service.ts` (the owner row reuses the pure `boardRows` directly); keep existing distribution tests green
- [x] 3.3 Implement `lib/home/month.ts` (`cache()`-wrapped `homeMonth`: periods, index, house name, `computeMonth` result) and `lib/home/me.ts` (`viewerOwner`, personal figures, `myRequest` incl. unseen REJECTED/DISBURSED once) until 3.1 passes
- [x] 3.4 Add failing tests then implement `lib/home/desk.ts`: fund total = Σ active accounts, pending count equals `listRequests` "Needs your decision", waited-over-3-days count, invites waiting + expired (newest INVITE token past `expiresAt`), reconciliation inputs per design D5 (incl. a test that disburses a loan and stays BALANCED)
- [x] 3.5 Add failing tests then implement `lib/home/reminders.ts` (reads open periods, unpaid units, approved-overdue requests; uses `pickReminders`; accepts hidden kinds) — timing tests use an injected `today`
- [x] 3.6 Add failing tests then implement `lib/home/activity.ts`: 6 newest across income/expense, payouts/advances, loans, cash repayments; voided entries, reversals, cancelled loans and reversed repayments excluded; signed amounts; link targets
- [x] 3.7 Add failing tests then implement `lib/home/setup.ts` (six steps; `null` when complete) and `lib/home/notices.ts` seam (`pinnedNotices` → empty, `openComplaintsCount` → 0)
- [x] 3.8 Implement `lib/home/dashboard.ts` assembling the role-aware payload (`me`/`myRequest` only when owner-linked; `desk`/`reminders`/`setup`/`quickActions` only with `dashboard.admin`; others `null`)

## 4. API

- [x] 4.1 Write failing integration tests `tests/integration/api/dashboard.test.ts`: 401 anonymous; Owner gets `me` and null admin keys; Super Admin not an owner gets `desk` and null `me`; Super Admin + owner gets both; `Cache-Control: no-store`; worked-example figures; `quickActions.generateRent` false when all rent recorded
- [x] 4.2 Add `app/api/v1/dashboard/schema.ts` (zod `DashboardResponseSchema`) and `route.ts` (`withAuth`, `await connection()`, `ok()` envelope) until 4.1 passes
- [x] 4.3 Register the endpoint in `app/api/v1/openapi.ts`; extend `tests/integration/api/openapi.test.ts` to assert `GET /dashboard` is present; verify `/api/v1/openapi.json` and the Swagger UI

## 5. Entries / Requests hooks for quick actions

- [x] 5.1 Introduce `EntryFormData = Pick<EntriesData, "month" | "status" | "latestOpen" | "periods" | "categories" | "units" | "funds">` and type `EntryDrawer` and `GenerateRentDialog` with it; existing `components/entries/*.test.tsx` stay green
- [x] 5.2 Write failing UI tests, then make `EntriesView` open the new-expense drawer when the URL has `?new=EXPENSE` (or `INCOME`) and drop the param on close
- [x] 5.3 Write failing UI tests, then make `RequestsView` open the request form on `?new=1` and drop the param on close

## 6. i18n

- [x] 6.1 Add every `home.*` and `shell.*` string from Home PRD §2.1, §8 and the specs to `lib/i18n/en.ts` and `lib/i18n/bn.ts` (greeting, hero sentences, loan line, first-month/no-share notes, desk tiles, formula line, reconciliation details labels, reminder texts and buttons, Hide today, staircase labels, activity titles, empty states, block-failed message, Updated just now, More, setup steps); remove keys only the old `HomeDesk` used

## 7. Home UI (component tests first)

- [x] 7.1 Write failing UI tests `components/home/home.test.tsx` with fixtures: who-sees-what for Owner / Admin-owner / Admin-not-owner; hero colours + word tags for OWED/ADVANCE/SETTLED; loan line; this-month rows incl. hidden Advances row and "None"; request strip texts; desk tiles incl. yellow vs plain pending, expired invites in red; reconciliation Balanced / Check + See details dialog parts; staircase Draft + shortfall note; activity rows signs/colours/links + empty; notices urgent/unread/Read more + empty; setup ✓/Continue; Bangla digits
- [x] 7.2 Build `components/home/BlockBoundary.tsx` (`catchError` fallback "Couldn't load {block}. Try again" + `retry()`) and `BlockSkeleton.tsx`; UI test forces a throw and checks siblings still render
- [x] 7.3 Build server blocks in `components/home/`: `HomeHeader`, `BalanceHero`, `ThisMonth`, `MyRequestStrip`, `SetupChecklist`, `Desk`, `Reminders`, `HouseThisMonth` (reuse `components/distribution/Staircase` where it fits), `LatestActivity`, `PinnedNotices`
- [x] 7.4 Build client islands: `QuickActions` (dynamic-import `EntryDrawer` / `GenerateRentDialog`, `router.refresh()` on save), `ReconciliationDetails` dialog, `ReminderStrip` with Hide today cookie (design D8), `NoticeBody` clamp/Read more, `HomeRefresh` (visibility ≥ 5 min, pull-to-refresh, "Updated just now")
- [x] 7.5 Rewrite `app/[lang]/(app)/page.tsx` to compose the blocks with Suspense + `BlockBoundary` in the desktop/mobile order (CSS grid areas; no duplicate DOM), reading the hidden-reminder cookie on the server; delete `components/app/HomeDesk.tsx`
- [x] 7.6 Make 7.1 pass; run design-system review (zero radius, one yellow, 2px rules, tabular money, 44px targets) and check 360px has no horizontal scroll

## 8. App shell

- [x] 8.1 Write failing tests in `components/app/shell.test.tsx` for: house line; top-bar action per role (+ New entry / + Request money / none); `bottomItems()` for Super Admin (Home, Entries, +, Distribution, More) and Owner (Home, Accounts, Requests, Income & expenses, More); More sheet lists the rest with badges and Log out that confirms first
- [x] 8.2 Pass house name and primary action from `app/[lang]/(app)/layout.tsx`; implement the pure `bottomItems()` and the More `Sheet` in `ShellNav`; reuse `useLogoutConfirm`
- [x] 8.3 Make 8.1 pass and keep `confirm-dialog.test.tsx` / `status-pages.test.tsx` green

## 9. Playwright

- [x] 9.1 Write `e2e/home.spec.ts` (seeded worked example): Owner sees hero −৳5,000 Advance outstanding, Share 40%, no desk; **My statement →** opens their owner page and the balance matches; staircase Distributable equals `/distribution`; Super Admin desk shows fund total, Balanced, pending count that matches `/requests`; **+ Expense** from Home saves and Latest activity + staircase update without reload; Rent status reminder **Hide today** survives reload; reconciliation **See details**; `/bn` at 360px has no horizontal scroll; mobile bottom nav per role and More → Settings; block failure fallback via a route that forces an error is covered in UI tests, not e2e
- [x] 9.2 Update existing e2e that relied on the old Home (`auth.spec.ts` pending-invites block, `owners.spec.ts` "Statement →", `requests.spec.ts` Home tile/strip, `period-distribution.spec.ts` close reminder text) and on bottom-nav items now inside More; keep `visual.spec.ts` baselines updated intentionally
- [x] 9.3 Run the full suite: `pnpm test` (unit + integration + UI) and `pnpm test:e2e`; all green

## 10. Verify & wrap up

- [x] 10.1 Manually verify on the dev server (`$CONDUCTOR_PORT`) as Super Admin and Owner, desktop and 360px, বাংলা and English; screenshots to `.context/`
- [x] 10.2 Check every Home PRD §10 acceptance box against the running app and note any gap in this change
- [x] 10.3 `openspec validate add-home-dashboard --strict`
