# reports Specification

## Purpose

Read-only report models and `/api/v1/reports/*` endpoints that turn the house's books into monthly, yearly, rent-roll, expense-analysis and fund-account reports — final for closed months (from the close snapshot), draft for open months (live), with the same numbers on screen, in print and in CSV. (Reports PRD F1–F4, F7–F11, §7; main PRD RPT-01, RPT-02, RPT-04, RPT-05)

## Requirements

### Requirement: Report access
Every `/api/v1/reports/*` endpoint SHALL require an authenticated user with `report.view` (401 `UNAUTHENTICATED` without a session, 403 `FORBIDDEN` without the permission), SHALL be scoped to the current property, SHALL return `Cache-Control: no-store`, and SHALL only read data. Super Admin and Owner MUST receive identical report bodies for the same query, including every owner's line (transparency, Reports PRD §4, Rule 9). Endpoints SHALL accept only `GET`.

#### Scenario: Owner and Super Admin see the same report
- **WHEN** an Owner and the Super Admin each request `GET /api/v1/reports/monthly?month=2026-10`
- **THEN** both get 200 with equal `data`, including all five owner rows

#### Scenario: No session
- **WHEN** an anonymous client requests `GET /api/v1/reports/yearly?year=2026`
- **THEN** the response is 401 with code `UNAUTHENTICATED`

#### Scenario: Invalid query
- **WHEN** a client requests `GET /api/v1/reports/monthly?month=2026-13`
- **THEN** the response is 422 with code `VALIDATION_FAILED`

### Requirement: Final and draft status
A report period SHALL be **FINAL** when its month is CLOSED and **DRAFT** when it is OPEN. A final month MUST take its staircase and entitlements from the snapshot saved at close (or, for a month closed without a snapshot, from the same live calculation Distribution uses); a draft month MUST be computed live with the Distribution formulas. Every month figure in every report SHALL carry its status, and final months SHALL carry the close timestamp. (F4, Rules 1–2, RPT-04)

#### Scenario: Closed month is final
- **WHEN** September 2026 is closed on 2026-10-03 and its monthly report is requested
- **THEN** `status` is `FINAL` and `closedAt` is the close timestamp

#### Scenario: Open month is draft
- **WHEN** October 2026 is open and its monthly report is requested
- **THEN** `status` is `DRAFT` and `closedAt` is null

### Requirement: Monthly report figures
`GET /api/v1/reports/monthly?month=YYYY-MM` SHALL return for the month: status and close date; income total and count; **expenses (all)** = every non-voided expense; **paid from Reserve** = the part of it flagged From Reserve; **expenses counted** = expenses (all) − paid from Reserve; the staircase (income, expenses counted, reserve and its source, previous deficit and its month, distributable, deficit carried and the month it carries into) identical to `GET /api/v1/distribution` for the same month; and the owner table rows (owner, units, share %, opening, entitlement, received, advance, loan deduction, other, balance, balance label, loan outstanding) identical to the Distribution board, plus a totals row whose entitlement equals the distributable. Voided entries MUST never count. Without `month` the latest CLOSED month SHALL be used, else the latest month; with no months at all the body is `{ month: null }`; an unknown month is 404 `NOT_FOUND`. (F1, F2, G1, G7, Rules 3–6, RPT-01)

#### Scenario: October draft matches Distribution
- **WHEN** October 2026 (income 10300000, expenses 1398000 none from Reserve, 5% reserve) is requested
- **THEN** `staircase` has incomePaisa 10300000, expensesCountedPaisa 1398000, reservePaisa 445100, previousDeficitPaisa 0, distributablePaisa 8456900, and the owner totals row has entitlementPaisa 8456900

#### Scenario: Reserve-paid expense
- **WHEN** a month has expenses of 5000000 of which 1800000 were paid From Reserve
- **THEN** `expensesAllPaisa` is 5000000, `paidFromReservePaisa` is 1800000 and the staircase uses expensesCountedPaisa 3200000

#### Scenario: Default month
- **WHEN** September is the latest closed month, October is open, and no `month` is given
- **THEN** the report is for `2026-09`

#### Scenario: Voided entry ignored
- **WHEN** a 300000 electricity entry of the month is voided
- **THEN** neither the expense total, the Electricity row nor its entry list includes it

### Requirement: Category breakdown and entries
The monthly report SHALL list income categories and expense categories that have at least one non-voided entry in the month, each with name (en and bn), entry count, amount, and share of its side's total in basis points (half-up), expense categories sorted by amount descending (ties by category order) and income categories in category order. Each category SHALL include its entries (date, description, vendor, unit name, fund account name, amount, From-Reserve flag, attachments with id, file name and mime), newest date first. Categories with no entries MUST NOT be listed. (F2.3–F2.5, G4, G5, §8 "Category with no entries")

#### Scenario: Expense category shares
- **WHEN** October expenses are Electricity 630000, Water 360000, Cleaning 300000, Gas 108000
- **THEN** the expense rows are in that order with shareBp 4506, 2575, 2146 and 773

#### Scenario: Entry with a bill
- **WHEN** the October DESCO electricity entry has one attached PDF
- **THEN** the Electricity category's entry lists that attachment's id, file name and `application/pdf`

### Requirement: Monthly notes
The monthly report SHALL include notes only when they apply: the latest reopen of the month (date and reason); the reserve override reason when the month's reserve was overridden; the active units with set rent but no non-voided income entry in the month (name and tenant); and, when the month carries a deficit, the deficit amount and the next month. (F2.8, §8)

#### Scenario: Unpaid rent note
- **WHEN** Flat 3A has rent 1800000 and no income entry in October
- **THEN** `notes.unpaidUnits` lists `{ name: "Flat 3A", tenantName: "Nusrat Jahan" }`

#### Scenario: Reopened month note
- **WHEN** September was reopened on 2026-10-05 with reason "Plumber bill was missed" and closed again
- **THEN** `notes.reopen` has that date and reason

### Requirement: Monthly comparisons
The monthly report SHALL include, for income, expenses (all) and distributable, the same figures for the previous month and for the same month a year earlier when those months exist (null otherwise), and for each expense category its amount in the previous month (0 when none). Change percentages SHALL be computed in basis points with the previous value as base and null when the base is 0. (F8, G9)

#### Scenario: Versus last month
- **WHEN** September income was 12500000 and October income is 10300000
- **THEN** `compare.lastMonth.incomePaisa` is 12500000 and the income change is −2200000 (−1760 bp)

#### Scenario: No month a year earlier
- **WHEN** October 2025 has no period
- **THEN** `compare.lastYear` is null

### Requirement: Yearly report
`GET /api/v1/reports/yearly?year=YYYY` SHALL return 12 month columns (January–December), each with status `FINAL`, `DRAFT` or `NONE` (no period) and, unless NONE, income, expenses (all), paid from Reserve, reserve kept, deficit carried and distributable using that month's final or draft figures; totals SHALL be split into **closed** (FINAL months only) and **draft** (DRAFT months), with closedCount and draftCount; `years` SHALL list every year that has at least one period, newest first. Without `year` the year of the latest closed month (else the latest month) SHALL be used; a year with no periods returns `{ year, months: [...12 NONE], empty: true }`. (F3, G1, G2, G3, Rule 5, RPT-02)

#### Scenario: Closed and draft totals are separate
- **WHEN** January–September 2026 are closed with income 112500000 and October is open with income 10300000
- **THEN** `totals.closed.incomePaisa` is 112500000, `totals.draft.incomePaisa` is 10300000, closedCount is 9 and draftCount is 1

#### Scenario: Empty months
- **WHEN** November and December 2026 have no period
- **THEN** their columns have status `NONE` and no figures

### Requirement: Yearly top expense categories
The yearly report SHALL list the five expense categories with the largest non-voided expenses (all) across every month of the year (final and draft), each with amount and share of the year's expenses (all) in basis points. (F3.5, §9.2)

#### Scenario: Top five
- **WHEN** 2026 expenses are Repairs 17570000, Guard 10800000, Electricity 6365000, Water 3705000, Holding tax 3700000 and Gas 900000
- **THEN** `topExpenseCategories` lists the first five in that order and omits Gas

### Requirement: Owner year table
The yearly report SHALL list every owner with: share units and percent now; every share change effective within the year (month, units before, units after); opening = Σ the owner's ledger booked before January of the year plus any OPENING-type entries booked within it; entitlement, paid out (payouts), advances, loan deductions and other (adjustments) = Σ of the owner's ledger entries of those types booked to the year's months, a reversal counting against the type it reverses (entitlements exist only for closed months, so Σ entitlement covers closed months only); balance now and loan outstanding as of today (equal to the Owners figures); and a totals row. Σ entitlement MUST equal Σ distributable of the year's closed months. Entitlements MUST come from each month's own share set, never today's. (F3.6, G7, G8, Rules 6–7)

#### Scenario: Entitlement sums to distributable
- **WHEN** the yearly report for 2026 is requested
- **THEN** `owners.totals.entitlementPaisa` equals `totals.closed.distributablePaisa`

#### Scenario: Share change noted
- **WHEN** Nasrin's units went from 50 to 40 in a share set effective 2026-06
- **THEN** her row's `shareChanges` contains `{ month: "2026-06", unitsBefore: 50, unitsAfter: 40 }`

#### Scenario: Balance now matches Owners
- **WHEN** Nasrin's current balance on the Owners list is −500000 and nothing is booked after 2026
- **THEN** her yearly row has balanceNowPaisa −500000, equal to opening + entitlement − paid out − advances − loan deductions + other

### Requirement: CSV export
`GET /api/v1/reports/monthly?month=…&format=csv` SHALL return `text/csv; charset=utf-8` with `Content-Disposition: attachment; filename="BariHisab-Monthly-{YYYY-MM}[-DRAFT].csv"` and one row per non-voided entry of the month with columns Date, Type, Category, Description, Vendor, Unit, Fund account, From reserve, Amount, Status. `GET /api/v1/reports/yearly?year=…&format=csv` SHALL return `BariHisab-Yearly-{YYYY}.csv` containing the month table (one row per month: Month, Status, Income, Expenses (all), From reserve, Reserve kept, Deficit carried, Distributable, then a Total row of closed months) followed by a blank line and the owner year table. Amounts SHALL be taka with two decimals and no grouping, dates `YYYY-MM-DD`, headers in English, and every value SHALL match the JSON report for the same query; cells starting with `=`, `+`, `-` or `@` that are text SHALL be prefixed with `'` (formula-injection guard). (F7, Rule 8)

#### Scenario: Monthly CSV row
- **WHEN** the October 2026 CSV is downloaded
- **THEN** the file name is `BariHisab-Monthly-2026-10-DRAFT.csv` and the electricity row ends with `6300.00,Draft`

#### Scenario: Formula-looking description
- **WHEN** an entry description is `=SUM(A1)`
- **THEN** the CSV cell is `'=SUM(A1)`

### Requirement: Rent roll
`GET /api/v1/reports/rent-roll?year=YYYY` SHALL return one row per unit (active units, plus inactive units with rent for the year) in unit order, and for each month of the year a cell about **that month's own rent** (an income entry with a unit pays for its reference month when it has one, else for the month it is booked to): `PAID` with the amount and entry ids when it was booked in or before that month, `ARREAR` with the amount, entry ids and the month it was booked in when it came later (also from the next year), or `NONE`. A late payment MUST NOT mark its booking month as paid. Per-unit totals and per-month totals count each month's rent however late it came; a unit is expected to pay in months that have a period from the month it was added (or first paid, if earlier) and, once inactive, only up to its last rent; expected = set rent × those months (per unit) and Σ set rent of units expected that month (per month); collection percent in basis points; months without a period have no expected. (F9, G10)

#### Scenario: Unpaid unit
- **WHEN** Flat 3A has no income in October 2026
- **THEN** its October cell is `NONE`

#### Scenario: Arrear paid later
- **WHEN** Flat 2A's September rent 1800000 is booked in October with reference month September
- **THEN** Flat 2A's September cell is `ARREAR` with `paidIn: "2026-10"` and amount 1800000, and its October cell holds only October's own rent

#### Scenario: Catch-up payment does not hide unpaid rent
- **WHEN** January's rent is booked in February and February's rent is never paid
- **THEN** January is `ARREAR` (paid in February) and February is `NONE`

### Requirement: Expense analysis
`GET /api/v1/reports/expenses?from=YYYY-MM&to=YYYY-MM[&categoryId=…]` SHALL accept a range of at most 36 months (`from` ≤ `to`, else 422) and optional repeated `categoryId` filters, and SHALL return over non-voided expenses of months in the range: total (all) and the part paid from Reserve; by category (amount, share in basis points, count) sorted by amount; top 10 vendors (blank vendors grouped as null); per month the amount per selected category (or the overall total when no filter); and the 10 largest single expenses (date, month, category, description, vendor, amount). (F10, G12)

#### Scenario: Repairs in 2026
- **WHEN** `from=2026-01&to=2026-12&categoryId={Repairs}` is requested and repairs total 17570000 of which 1800000 from Reserve
- **THEN** `totalPaisa` is 17570000 and `fromReservePaisa` is 1800000

#### Scenario: Range too long
- **WHEN** `from=2023-01&to=2026-12` is requested
- **THEN** the response is 422 `VALIDATION_FAILED`

### Requirement: Fund accounts report
`GET /api/v1/reports/funds?month=YYYY-MM` or `?year=YYYY` SHALL return, per fund account (active, plus inactive ones with movements in the period): opening balance at the start of the period (the account's own opening balance counts only from its opening month on); income in; expenses out; owner payments out (payouts and advances, net of reversals); loans out (principal of loans disbursed in the period); loan repayments in (net cash effect of loan movements of the period); closing = opening + income − expenses − owner payments − loans out + loan repayments. Entries and ledger moves SHALL be attributed to the month they are booked to and loans to their disbursement month. The closing balance of the latest month that has a period (normally the current month; moves booked to later months are not in earlier closings) MUST equal each account's balance in Settings › Fund accounts, and Σ active closing balances MUST equal the Home House Fund. Exactly one of `month` or `year` is required (422 otherwise). (F11, G11)

#### Scenario: Cash account in October
- **WHEN** the Cash account opened at 0, received 10300000 income and paid 1398000 expenses and a 500000 advance in October 2026
- **THEN** its October row has openingPaisa 0, incomePaisa 10300000, expensesPaisa 1398000, ownerPaymentsPaisa 500000 and closingPaisa 8402000

#### Scenario: Matches Settings
- **WHEN** the funds report for the latest month is requested
- **THEN** every account's closingPaisa equals its `balancePaisa` from `GET /api/v1/fund-accounts`

### Requirement: Swagger documentation
Every reports endpoint, its query parameters and its response schema (including the CSV variant) SHALL be registered in the OpenAPI document served at `/api/v1/openapi.json`.

#### Scenario: Paths documented
- **WHEN** `/api/v1/openapi.json` is fetched
- **THEN** it contains `/reports/monthly`, `/reports/yearly`, `/reports/rent-roll`, `/reports/expenses` and `/reports/funds`
