## 1. Prep

- [x] 1.1 Confirm baseline is green before touching anything: `pnpm typecheck`, `pnpm test`, and note other sessions' uncommitted WIP in shared files (`globals.css`, `lib/i18n/*`, `nav.ts`, `openapi.ts`, `components/skeletons/pages.tsx`) so edits stay additive
- [x] 1.2 Read `node_modules/next/dist/docs/` guides for `redirect`, `searchParams` in pages, route handlers returning non-JSON `Response`, and `connection()`; read the barihisab-design-system skill (charts, tags, tables, print)

## 2. Permission and navigation (test-first)

- [x] 2.1 Update `lib/permissions.test.ts` (45 Super Admin keys, 12 Owner keys incl. `report.view`) and nav/shell tests (`components/app/shell.test.tsx`: owner bar Home · Accounts→`/reports` · Requests · Income & expenses · More; Owners in More; Reports in sidebar after Advances; Super Admin More lists Reports) — watch them fail
- [x] 2.2 Add `report.view` to `ALL_PERMISSIONS` and OWNER in `lib/permissions.ts`; add the Reports `NAV_ITEMS` entry and switch the owner `bottomNav` candidate `/owners` → `/reports` (label `shell.accounts`) in `components/app/nav.ts`; add `nav.reports`/`meta.reports` keys (en/bn) until 2.1 passes; grep for other "Accounts"→Owners links and repoint them

## 3. Pure report formulas (test-first, 100% coverage)

- [x] 3.1 Write failing unit tests `lib/accounting/reports.test.ts`: `shareBp` half-up (PRD §9.1 4506/2575/2146/773, total 0 → 0); `changeBp` (−1760 bp, base 0 → null); `categoryRows` (drop empty, expense sort by amount then order, income by order); `monthFigure` from snapshot and from live staircase (expenses all = counted + reserve-paid); `yearTotals` closed/draft split and counts; `ownerYearRows` (reversal counts against reversed type, signs, OPENING within year → opening, totals); `shareChanges` (50→40 in 2026-06); `rentRollCells` (PAID, NONE, ARREAR paidIn, expected, collection bp); `fundPeriodRows` (opening/closing identity)
- [x] 3.2 Implement `lib/accounting/reports.ts` until 3.1 passes with 100% coverage
- [x] 3.3 Write failing unit tests `lib/reports/csv.test.ts`: `taka(630000)` = `6300.00`, negative amounts, RFC 4180 quoting of commas/quotes/newlines, `'` prefix for `=`/`+`/`-`/`@` text cells, CRLF, UTF-8 BOM; then implement `lib/reports/csv.ts` (monthly entries CSV + yearly month/owner CSV builders)

## 4. Read services (integration tests first)

- [x] 4.1 Add `lib/reports/params.ts` shared zod query schemas (month key, year 2000–2100, from/to ≤ 36 months with from ≤ to, repeated `categoryId` uuids, funds month XOR year, `format=csv`) with unit tests for the edge cases
- [x] 4.2 Write failing integration tests `tests/integration/api/reports-monthly.test.ts` on `distributionWorld()`: October draft staircase/owner rows equal `GET /distribution`; totals entitlement = distributable; default month = latest closed (close September first); unknown month 404; `{ month: null }` with no periods; voided entry excluded everywhere; reserve-paid split; category rows/shareBp/sort; entries with attachments (removed ones hidden); notes (unpaid Flat 3A, reopen reason, override reason, deficit); comparisons vs last month / last year (null when missing); Owner vs Super Admin identical body
- [x] 4.3 Implement `lib/reports/dto.ts` and `lib/reports/monthly.ts` (wraps `getDistribution` per design D1, plus category groupBy, entries + attachments query, notes, comparisons) until 4.2 passes
- [x] 4.4 Write failing integration tests `tests/integration/api/reports-yearly.test.ts`: 12 columns with FINAL/DRAFT/NONE; closed vs draft totals and counts; month figures equal each month's Distribution staircase; top 5 categories; owner year table Σ entitlement = closed distributable, balance now = Owners list balance, loan outstanding = Advances figure, share change note; `years` list; default year; empty year
- [x] 4.5 Implement `lib/reports/yearly.ts` (snapshot for closed months, `computeMonth` only for open/legacy months; grouped queries per design D4) until 4.4 passes
- [x] 4.6 Write failing integration tests `tests/integration/api/reports-rent-roll.test.ts` (PAID/NONE/ARREAR, inactive unit with rent shown, totals, expected, collection bp, entry ids) then implement `lib/reports/rent-roll.ts`
- [x] 4.7 Write failing integration tests `tests/integration/api/reports-expenses.test.ts` (range total + from-reserve, category filter, by-category bp, top 10 vendors with null vendor group, per-month trend, top 10 expenses, voided excluded) then implement `lib/reports/expenses.ts`
- [x] 4.8 Write failing integration tests `tests/integration/api/reports-funds.test.ts` (month and year modes; opening/closing identity; payouts/advances/reversals net; loan disbursal in month, cash repayment and its reversal; current-month closing equals `GET /fund-accounts` balance and Σ active = House Fund) then implement `lib/reports/funds.ts`

## 5. API endpoints and Swagger

- [x] 5.1 Write failing route tests (same files as section 4, `apiRequest` helper): 401 anonymous, 403 for a user without `report.view`, 422 `VALIDATION_FAILED` for bad month/year/range/funds params, `Cache-Control: no-store`; CSV variant: `text/csv; charset=utf-8`, `Content-Disposition` file names (`BariHisab-Monthly-2026-10-DRAFT.csv`, `BariHisab-Monthly-2026-09.csv`, `BariHisab-Yearly-2026.csv`), body rows match JSON figures
- [x] 5.2 Add `app/api/v1/reports/{monthly,yearly,rent-roll,expenses,funds}/{schema.ts,route.ts}` (`withAuth` + `report.view`, `await connection()`, `parse`, `ok()`; raw CSV `Response` for `format=csv`) until 5.1 passes
- [x] 5.3 Register all five schemas in `app/api/v1/openapi.ts` (JSON + `text/csv` responses, query params); extend `tests/integration/api/openapi.test.ts` to assert the five `/reports/*` paths; fetch `/api/v1/openapi.json` on the dev server and confirm they appear in Swagger UI

## 6. Reports UI (component tests first)

- [x] 6.1 Add `rpt.*` i18n keys in `lib/i18n/en.ts` and `bn.ts` (tabs, titles, columns, statuses, notes and messages from PRD §8, comparison words, print/PDF/CSV labels, "Preparing PDF…", "Couldn't create the PDF. Try again.", save-as-PDF hint); keep `lib/i18n/i18n.test.ts` key-parity green
- [x] 6.2 Write failing RTL tests `components/reports/reports.test.tsx` with `components/reports/fixtures.ts`: header tabs `aria-current`, month picker Draft marker + navigation href, Final/Draft tags, summary line with deficit, category "{amount} · {%}" and bars, expand (`aria-expanded`) lists entries with Reserve tag and bill button, comparisons with arrows + words and the >20% category hint, owner table totals and balance words, notes, owner-statement hrefs, empty month "—" + "No entries in {Month}.", yearly "+ draft" totals, chart month links + aria-labels, month table Draft headers, owner year share-change note, "No data for {year} yet.", rent roll cells, expense analysis range error, funds table totals, Bangla digits/month names
- [x] 6.3 Build `components/reports/` (`ReportsHeader`, `MonthPicker`, `YearPicker`, `MonthlyReport`, `CategoryList`, `OwnerTable`, `YearlyReport`, `YearChart`, `MonthTable`, `OwnerYearTable`, `RentRoll`, `ExpenseAnalysis`, `FundsReport`, `format.ts`) per design D6 and the design system until 6.2 passes; reuse `Staircase`, `AttachmentGallery`, `formatMoney`, `monthLabel`
- [x] 6.4 Add report CSS to `app/globals.css` (`.rpt-*`: bars, hatched draft, sticky first column scroll wrapper, chart, tags) using tokens only, zero radius, one yellow
- [x] 6.5 Add `ReportsSkeleton` (and a report print skeleton reading "Preparing PDF…") to `components/skeletons/pages.tsx` with a test in `components/skeletons/pages.test.tsx`
- [x] 6.6 Add pages `app/[lang]/(app)/reports/page.tsx` (redirect → monthly) and `reports/{monthly,yearly,rent-roll,expenses,funds}/page.tsx` (getLocale → Suspense skeleton → `requirePagePermission("report.view")` → service → view; invalid params fall back to defaults; `generateMetadata` titles)

## 7. Print and PDF

- [x] 7.1 Write failing RTL tests for `PrintFrame` and the print report: header (house, address, title, period, Final / "Draft · may change"), footer "Generated by {Name} on {date}", watermark only for drafts, monthly Entries appendix rows, document-title helper returns `BariHisab-Monthly-2026-10-DRAFT` / `BariHisab-Monthly-2026-09` / `BariHisab-Yearly-2026`, PDF hint only with `pdf=1`
- [x] 7.2 Implement `components/reports/PrintFrame.tsx` + print-mode rendering of `MonthlyReport`/`YearlyReport`, a `ReportAutoPrint` client helper (sets `document.title`, opens print once), and pages `app/[lang]/(print)/reports/{monthly,yearly}/print/page.tsx` plus `app/[lang]/(print)/reports/error.tsx` ("Couldn't create the PDF. Try again." + retry) until 7.1 passes
- [x] 7.3 Add `@media print` rules (A4 portrait, fixed header/footer/watermark, `thead` repeat, `break-inside: avoid`, section page breaks, yellow → grey, `@page` page counter) and wire header **Print** / **PDF** (new tab to print view, `&pdf=1`) and **CSV** (link to the API CSV) actions; check a real print preview in Chrome for en and bn

## 8. End-to-end and regression

- [x] 8.1 Write `e2e/reports.spec.ts` (sorts after `period-distribution`, before `requests`; read-only; `resetRateLimits()` in `beforeAll`): owner taps Accounts → `/reports/monthly` latest closed month with Final tag; pick the open month → Draft tag and distributable equals the Distribution page; expand a category → entries listed; Yearly → closed/draft counts, chart month link opens Monthly; Rent roll, Expenses (range + category) and Fund accounts tabs render and keep params in the URL; Print view shows title + watermark for a draft and the document title is the PDF file name; CSV download has the PRD file name; owner-statement link opens the owner page; `/bn/reports/monthly` shows Bangla labels/digits; Super Admin reaches Reports via More at 360px; no horizontal page scroll at 360px
- [x] 8.2 Add `/reports/monthly` and `/reports/yearly` to `e2e/visual.spec.ts` (desktop + mobile-360) and update any spec asserting the owner bottom bar (`summary-home.spec.ts`, `owners.spec.ts`) for Accounts → Reports
- [x] 8.3 Run the full suite: `pnpm typecheck`, `pnpm lint`, `pnpm test` (unit + integration + ui, coverage 100% on `lib/accounting/reports.ts`), `pnpm test:e2e`; fix regressions without changing other sections' behaviour
- [x] 8.4 Manual check on the dev server (`$CONDUCTOR_PORT`): Monthly/Yearly in en and bn at 1280px and 360px, print preview of a final and a draft month, PDF save name, CSV opens in a spreadsheet with Bangla names intact; save screenshots under `.context/`

## 9. Recharts on every tab (user request 2026-11-11)

- [x] 9.1 Install `recharts`; validate the ink/yellow pair with the dataviz validator (CVD ΔE ≈ 60; yellow contrast relief = olive edge + table views)
- [x] 9.2 Add `components/reports/charts/` (theme, tooltip, legend, `CategoryBarChart`, `YearChart`, `MonthBarChart`, `FundsChart`, `useNarrow`) with tests (`charts.test.tsx`)
- [x] 9.3 Replace the CSS category bars and the CSS year chart; add charts to Rent roll, Expenses and Fund accounts; update `reports.test.tsx`
- [x] 9.4 Print: fixed A4 chart width, yellow → grey; phones: month initials; check en/bn at 1280px/360px and print on a production build; full vitest + e2e green

## 10. Code review fixes (2026-11-11)

- [x] 10.1 Rent roll: a cell is that month's own rent (PAID on time / ARREAR with amount when paid later, also from the next year); a catch-up payment never marks its booking month paid
- [x] 10.2 Rent roll: expected rent only from the month a unit was added (or first paid) and, once inactive, up to its last rent
- [x] 10.3 Yearly: carry the deficit through consecutive open months instead of re-walking the chain per month
- [x] 10.4 Fund accounts: opening balance counts from the account's opening month; a period-less `?month=` falls back to the default month
- [x] 10.5 Expense analysis aggregates in the database (sums, groups, top 10) instead of loading every row
- [x] 10.6 Charts: screen-reader summary of every plotted value; "<1%" for tiny shares; private files never listed; print month fallback; month-input hint
