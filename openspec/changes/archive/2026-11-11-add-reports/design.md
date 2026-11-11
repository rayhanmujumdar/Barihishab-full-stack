## Context

See proposal.md for scope. Everything Reports shows already exists and is already computed somewhere:

- **Month figures** — `lib/distribution/month-data.ts` (`loadPeriods`, `computeMonth`, `periodTotals`, `previousDeficit`) and the close snapshot (`lib/distribution/snapshot.ts`: income, expense *counted*, `reserveSpentPaisa`, reserve, deficit, shares, entitlements). In this codebase the staircase's `expensePaisa` already means **Expenses counted** and `reserveSpentPaisa` is "paid from Reserve" — so Expenses (all) = sum of the two.
- **Owner board** — `getDistribution()` in `lib/distribution/distribution-service.ts` returns staircase, owner rows (opening, entitlement, received, advance, loan deduction, other, balance, loan outstanding), totals, reopens and the reserve override.
- **Balances / loans / funds** — `balancesByOwner`, `activeLoans`/`loanOutstandingByOwner`, `fundMovements` + `listFunds`, `unpaidUnitsIn`.
- **Print precedent** — Owners statement print view (`app/[lang]/(print)/owners/[id]/statement/print`, `AutoPrint` sets `document.title` = file name, then `window.print()`); `.print-page` / `@media print` rules in `app/globals.css`.
- Pages are RSC that call services directly and pass DTOs to a client view (Distribution pattern); pickers navigate with `router.push`. `cacheComponents` is on → API GETs call `await connection()`.

## Goals / Non-Goals

**Goals:**
- Reports numbers are produced by the *same* functions Distribution / Owners / Settings use, so "matches Distribution / Owners / Settings" holds by construction.
- One DTO per report feeds the screen, the print view and the CSV.
- No schema migration, no new dependency.

**Non-Goals:**
- Server-side PDF bytes, archive storage, Excel (proposal: out of scope).
- Caching layer or materialised report tables — volumes are tiny (one house, ≤ ~40 entries/month).

## Decisions

### D1 · Monthly report wraps `getDistribution`
`monthlyReport(propertyId, month)` calls `getDistribution(propertyId, key, null)` for staircase, owner rows, totals, reopens and override, then adds category breakdown, entries, notes and comparisons.
*Why:* acceptance criterion "staircase and owner table match Distribution" becomes structural, not tested-for. *Alternative:* re-derive from `month-data` → duplicated board logic that could drift. The few extra queries `getDistribution` makes (reserve balance, paid-after-close) are cheap.
Default month differs from Distribution (latest **closed** vs oldest open), so the report resolves the key first (latest CLOSED period, else latest period) and passes it explicitly.

### D2 · PDF = the print view (user decision 2026-11-11)
**Print** and **PDF** both open `/[lang]/reports/{monthly|yearly}/print?…` in a new tab. The print page renders the same report components in print mode; a client `AutoPrint`-style helper sets `document.title` to the PRD file name (`BariHisab-Monthly-2026-10-DRAFT`) so Chrome/Edge/Safari "Save as PDF" proposes that name, then opens the dialog. `&pdf=1` adds a no-print hint "Choose 'Save as PDF' as the destination". The page body is inside `<Suspense>` whose fallback says "Preparing PDF…"; an `error.tsx` under `(print)/reports` shows "Couldn't create the PDF. Try again." with `reset()`.
*Why:* Bangla conjuncts render correctly only with a real text shaper; the browser is one. Reuses the Owners pattern. *Alternatives:* `@react-pdf/renderer` (broken Bangla shaping), headless Chromium (heavy server dependency) — both rejected by the user. *Deviation from PRD F6:* the file is saved by the browser, not streamed by the app; Archive (F12) is dropped.

Print CSS (in `globals.css`, `@media print`): `@page { size: A4 portrait; margin: 14mm }`; `.rpt-print-head` / `.rpt-print-foot` are `position: fixed` (repeat on every page in Chromium and Firefox); `thead { display: table-header-group }`; `tr, .rpt-section-head { break-inside: avoid }`; `.rpt-section { break-before: page }` for owner table and appendix; `--signal` → `#bbb` grey; watermark `.rpt-watermark` is `position: fixed`, rotated −30°, outlined text, `z-index` above content but `pointer-events: none`. "Page X of Y" is added with `@page { @bottom-right { content: counter(page) " / " counter(pages) } }` — progressive (Chromium ≥131); where unsupported the footer simply has no page count (noted deviation).

### D3 · Pure formulas in `lib/accounting/reports.ts` (100% covered)
- `shareBp(amount, total)` – half-up basis points, 0 when total 0.
- `changeBp(now, before)` – null when before is 0.
- `categoryRows(groups, order)` – count, amount, shareBp, sort (expenses by amount desc, ties by sortOrder; income by sortOrder), drops empty.
- `monthFigure(source)` – from a snapshot or a live `Staircase` → `{ incomePaisa, expensesAllPaisa, fromReservePaisa, expensesCountedPaisa, reservePaisa, deficitCarriedPaisa, distributablePaisa }`.
- `yearTotals(columns)` – closed vs draft sums and counts.
- `ownerYearRows(entries, …)` – classifies each ledger row by its own type, or for `REVERSAL` by the type of the row it reverses; signs flipped for display (paid out, advances, loan deductions positive).
- `shareChanges(sets, year, ownerId)` – effective-in-year sets with units before/after (uses `setInForce`).
- `rentRollCells(units, months, incomes)` – PAID / ARREAR / NONE + totals, expected, collection bp.
- `fundPeriodRows(funds, movesBefore, movesIn)` – opening/closing per account.
- CSV helpers in `lib/reports/csv.ts` (pure): `taka(paisa)` → `"6300.00"`, RFC 4180 quoting, formula-injection prefix `'`, CRLF rows, UTF-8 BOM so Excel opens Bangla names correctly.

### D4 · Read services in `lib/reports/`
`monthly.ts`, `yearly.ts`, `rent-roll.ts`, `expenses.ts`, `funds.ts`, `dto.ts`, `params.ts` (shared zod query schemas used by API and pages: month key, year 2000–2100, range ≤ 36 months).
- **Yearly**: one `loadPeriods`; for each month in the year: CLOSED with snapshot → snapshot; otherwise → `computeMonth` (only open / legacy months, usually 1). Top categories: one `houseTransaction.groupBy({ by: categoryId })` over the year's period ids. Owner table: one `ownerLedgerEntry.findMany` for the year's periods (select type, amount, ownerId, `reverses.type`) + one `groupBy` for pre-year openings + `balancesByOwner` + `loanOutstandingByOwner` + `loadShareSets`.
- **Comparisons**: monthly reuses the yearly per-month figure function for `addMonths(key,-1)` and `addMonths(key,-12)`, plus one category groupBy for the previous month.
- **Entries**: one `houseTransaction.findMany({ periodId, voidedAt: null })` with category/unit/fund names + one `attachment.findMany({ entityType: 'house_transaction', entityId in …, removedAt: null, isPrivate: false })`.
- **Funds**: per-period grouping by `periodId` for txns, ledger (fundAccountId not null) and loan movements; loans grouped by `disbursedOn` month. Opening = `openingBalancePaisa` + Σ moves in periods before the range. Implemented on the same movement sign conventions as `fundMovements`, and an integration test asserts current-month closing = `listFunds()` balance.
- **Rent roll**: income txns with `unitId` in the year's periods (+ `referencePeriodId`), units ordered like Settings.

### D5 · API: `app/api/v1/reports/<name>/{route,schema}.ts`
Five GET routes, each `withAuth(..., { permission: "report.view" })`, `await connection()`, `parse(QuerySchema, searchParams(req))`, `ok(data, { headers: { "Cache-Control": "no-store" } })`. `format=csv` on monthly/yearly returns a raw `Response` (`text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="…"`) — the one place outside the JSON envelope, documented in Swagger with a `text/csv` response. Schemas register in `app/api/v1/openapi.ts`.
*Deviation:* main PRD §10 writes `?period=`; we use `?month=` like `/distribution` for consistency. `?format=pdf|xlsx` is not offered (D2, P3).

### D6 · Routes & UI
- Static segments `app/[lang]/(app)/reports/{monthly,yearly,rent-roll,expenses,funds}/page.tsx` + `reports/page.tsx` → `redirect` to monthly. Each page: `await getLocale()` → `<Suspense fallback={<ReportsSkeleton/>}>` → permission check → service → client view. No TanStack Query (read-only, URL-driven; `router.push` re-renders the RSC).
- `components/reports/`: `ReportsHeader` (kicker, title, tabs, picker slot, actions), `MonthPicker`/`YearPicker` (reuse the Distribution prev/next + select pattern), `MonthlyReport`, `YearlyReport`, `YearChart`, `CategoryList` (expand → entries, bill icon → existing `AttachmentGallery` viewer), `OwnerTable`, `OwnerYearTable`, `MonthTable`, `RentRoll`, `ExpenseAnalysis`, `FundsReport`, `PrintFrame` (header/footer/watermark), `format.ts` (bp→%, change words). Report components are server-compatible where possible so the print page renders them without client JS; only header controls, category expand and the bill viewer are client.
- Charts (revised 2026-11-11 at the user's request): **Recharts** in `components/reports/charts/` — `CategoryBarChart` (horizontal, direct "amount · %" labels), `YearChart` (grouped income/expense, drafts hatched with SVG patterns, bar click → Monthly), `MonthBarChart` (one measure per month + optional dashed reference line on the same axis), `FundsChart` (money in vs out per account). Tokens mirrored in `theme.ts` (SVG attributes can't read CSS variables): income ink, expense yellow with an olive edge (yellow alone is 1.5:1 on paper), print turns yellow grey. No gridlines, zero radius, 2px ink baseline, one Y axis, HTML legend for ≥2 series, hover tooltip. Screen charts use `responsive`; print charts render at a fixed A4 width (680px) so they don't depend on container measuring. Each chart has a table view beside it (category list, month table, rent-roll grid, trend table, funds table); the Yearly month row under the plot is the keyboard/screen-reader path. Phones get month initials. *Alternative kept before:* plain CSS bars (no dependency) — replaced on request.
- Wide tables: `.rpt-scroll` wrapper `overflow-x: auto` + `position: sticky; left: 0` first column.
- Staircase: reuse `components/distribution/Staircase.tsx` if its props fit (read-only), else a small report variant with the same classes.
- Skeleton: `ReportsSkeleton` in `components/skeletons/pages.tsx` (header + tabs + two columns + table) built from existing primitives.

### D7 · Permission and navigation
`report.view` added to `ALL_PERMISSIONS` and OWNER. Nav: `{ href: "/reports", label: "nav.reports", icon: DocumentChartBarIcon, permission: "report.view" }` after Advances. `bottomNav` owner candidates become `["/reports", "/requests", "/entries", "/advances"]`, with `/reports` relabelled `shell.accounts`; Owners falls to More. Existing `startsWith` active matching covers `/reports/*`. Home/other links to "Accounts" (if any) are checked and repointed.

### D8 · i18n
New `rpt.*` keys in `lib/i18n/en.ts` and `bn.ts` (titles, tabs, columns, notes, messages from PRD §8, CSV/print/PDF labels). Month names via `monthLabel`, money via `formatMoney`, digits via `toBanglaDigits`. CSV stays English (F7).

### D9 · Tests
- Unit: `lib/accounting/reports.test.ts`, `lib/reports/csv.test.ts` (100%).
- Integration: `tests/integration/api/reports-monthly.test.ts`, `reports-yearly.test.ts`, `reports-rent-roll.test.ts`, `reports-expenses.test.ts`, `reports-funds.test.ts` on `distributionWorld()` (+ closing September for FINAL cases), asserting equality with `/distribution`, `/owners`, `/fund-accounts` responses and the PRD §9 figures; auth 401/403; 422s; CSV headers/body.
- UI (vitest + RTL): `components/reports/reports.test.tsx` with fixtures — draft tag, expand, comparisons words, empty states, Bangla digits.
- E2E `e2e/reports.spec.ts` (alphabetically after `period-distribution`, before `requests`): owner opens Accounts → Monthly default, picker → October draft tag, expand category + bill, Yearly chart → monthly link, print view title + watermark, CSV download name, 360px no page scroll, `/bn` labels. Read-only → state-neutral; `resetRateLimits()` in `beforeAll`. `visual.spec.ts` adds `/reports/monthly`.
- Updated: `lib/permissions.test.ts`, nav/shell tests, `tests/integration/api/openapi.test.ts`.

## Risks / Trade-offs

- [Browser decides the PDF file name and page numbering] → set `document.title`; Chromium honours it; page count via `@page` margin boxes is progressive; documented as PRD deviation.
- [`getDistribution` does more work than Reports needs] → acceptable at one-house scale; if profiling shows >2 s, extract its internal `boardFor` instead of calling the whole function.
- [Yearly live months walk `previousDeficit` from the nearest snapshot] → only open/legacy months compute live; at most a handful per year.
- [Fund report attributes cash by booking month, not cash date] → matches PRD §3 "Period" and the Distribution model; closing of the current month still equals today's balance (asserted by test).
- [Opening balances of accounts opened mid-year appear from the first month] → `fundBalance` has no date dimension for openings today; noted, consistent with Settings.
- [Owner bottom-bar change moves Owners into More] → covered by updated shell tests and the app-shell delta spec.
- [Concurrent WIP in shared files (`globals.css`, `en.ts`, `bn.ts`, `nav.ts`, `openapi.ts`)] → additive edits only; stage hunks carefully when committing.

## Migration Plan

No database migration. Deploy = ship code; rollback = revert the commit (new permission key disappears with it; no stored data references it).

## Open Questions

- Signature line ("Prepared by / Checked by") on printouts (PRD §12) — can be added to `PrintFrame` later without spec changes beyond a footer line.
- Whether rent roll should hide tenant names from owners (PRD §12) — shown for now (Distribution already shows them to owners).
