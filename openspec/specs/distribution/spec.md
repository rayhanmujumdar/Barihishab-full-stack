# distribution Specification

## Purpose

Turns a month's house income and expenses into a distributable amount and each owner's exact share, shown as a live preview for open months and as a frozen snapshot for closed months, so every owner can see how their share was reached. (Distribution PRD F1–F4, F10, F15, §7.1–7.3; main PRD §5.2–5.3, DST-01, DST-05)

## Requirements

### Requirement: Staircase calculation
For a month the system SHALL compute, in paisa: Income = Σ non-voided income entries of the month; Expense = Σ non-voided expense entries of the month not paid from the Reserve; Surplus = Income − Expense; Reserve per the reserve capability (0 when Surplus ≤ 0); Net = Surplus − Reserve − Previous deficit; Distributable = max(0, Net); Deficit carried = max(0, −Net). Previous deficit SHALL be the previous month's Deficit carried (from its snapshot when closed, computed live when open) and 0 when no previous month exists. Reserve-paid expenses of the month SHALL be reported separately. (§7.1, F10, Rules 9–10; main PRD §5.2)

#### Scenario: October preview
- **WHEN** October 2026 has income 10300000, expenses 1398000, a 5 % reserve rule and no previous deficit
- **THEN** Reserve is 445100, Previous deficit 0 and Distributable 8456900

#### Scenario: Deficit month and carry
- **WHEN** April has income 12500000 and expenses 17078000, and May has income 12500000 and expenses 2678000, with a 5 % reserve rule
- **THEN** April has Reserve 0, Distributable 0 and Deficit carried 4578000, and May has Reserve 491100, Previous deficit 4578000 and Distributable 4752900

#### Scenario: Voided and reserve-paid entries excluded
- **WHEN** a month has a voided 100000 income and a 300000 expense marked paid from the Reserve
- **THEN** neither counts in Income or Expense, and `reserveSpentPaisa` is 300000

#### Scenario: Previous month still open
- **WHEN** September is open with Net −50000 and October is open
- **THEN** October's Previous deficit is 50000

### Requirement: Entitlement allocation
Each owner's entitlement SHALL be Distributable × owner units ÷ total units of the share set in force for the month, computed in paisa: each share is floored, then the leftover paisa (fewer than the number of owners) go one each to the largest fractional remainders, ties broken by owner display order. The entitlements MUST add up to the Distributable exactly. Owners with 0 units get 0 and no entitlement. (§7.2, §11.3, Rule 12; main PRD §5.3)

#### Scenario: Three equal owners
- **WHEN** Distributable is 100000 and three owners hold 1 : 1 : 1 units
- **THEN** entitlements are 33334, 33333, 33333 in display order and sum to 100000

#### Scenario: October shares
- **WHEN** Distributable is 8456900 with units 40 : 25 : 15 : 10 : 10
- **THEN** entitlements are 3382760, 2114225, 1268535, 845690, 845690

#### Scenario: Zero distributable
- **WHEN** Distributable is 0
- **THEN** every owner with units has entitlement 0

### Requirement: Owner board figures
For a month the board SHALL list, in owner display order, every owner who has units in that month's share set or any ledger entry in that month (G8). Per owner it SHALL return share units and percent (none for 0 units), Opening (Σ ledger entries of earlier months), Entitlement, Received (payouts of the month), Advance (advances of the month), Loan ded., Other (opening entries, adjustments and reversals of the month, shown only when not 0), Balance, and Loan outstanding. An original entry voided in the same month and its reversal MUST cancel out and appear in no column; a reversal whose original is in another month counts in Other. For a closed month Entitlement and Loan ded. SHALL be the posted values and Balance the balance at the end of the month. For an open month Entitlement and Loan ded. SHALL be previews, Balance SHALL be the owner's current balance ("Balance now"), and After close SHALL be Balance now + preview Entitlement − preview Loan ded. A totals row SHALL sum Entitlement, Received, Advance, Loan ded. and Other. (F3, G8, G10, G13, §7.3)

#### Scenario: Preview after close figure
- **WHEN** October is open, Tanvir's balance now is 805585, his preview entitlement is 1268535 and his loan instalment preview is 500000
- **THEN** his row shows Balance 805585 and After close 1574120

#### Scenario: 0-unit owner with activity
- **WHEN** a former owner with 0 units was paid 200000 in October
- **THEN** they appear on October's board with no share, Entitlement 0 and Received 200000

#### Scenario: Voided payout in the same month
- **WHEN** a 500000 payout in October was voided in October
- **THEN** October's Received and Other exclude both the payout and its reversal

### Requirement: Accuracy footer
The read model SHALL return Σ entitlements, the Distributable, a flag `balanced` (equal to the paisa), the shares used (first name and units per owner with units) and the rounding method `largest-remainder`. (F4, Rule 11)

#### Scenario: Balanced footer
- **WHEN** the October board is read
- **THEN** `sumEntitlementsPaisa` and `distributablePaisa` are both 8456900 and `balanced` is true

### Requirement: Closed months read the snapshot
A closed month's staircase, shares used, entitlements and loan deductions SHALL come only from the snapshot saved at close; later changes to the reserve rule, the override or share sets MUST NOT change them. (G11, F15, Rule 6)

#### Scenario: Rule changed after close
- **WHEN** October was closed with a 5 % reserve (445100) and the rule is later set to Off
- **THEN** October still shows Reserve 445100 and Distributable 8456900

### Requirement: Distribution read endpoint
`GET /api/v1/distribution?month=YYYY-MM` (permission `distribution.view`) SHALL return the month (key, status, closed by name and time, reopen count, reopen history with date, name and reason), the staircase with notes (deficit created, reserve-paid amount, reserve override and reason), the previous-deficit source month, the reserve rule description and reserve balance, the board rows and totals, the footer, the previous month that must close first (when it is open), whether the month is the latest closed month, and — for a closed month that was reopened — the before → after changes of the last re-close. Without `month` it SHALL return the oldest open month. An unknown or malformed month returns `404` / `422`. With no periods at all it SHALL return `200` with `month: null`. Every query MUST be scoped to the current property. (F1, F15, DST-01, DST-05)

#### Scenario: Default month
- **WHEN** an Owner calls the endpoint without `month` while September is closed and October and November are open
- **THEN** the response is October's board with status `OPEN`

#### Scenario: Must close first
- **WHEN** November is requested while October is open
- **THEN** `mustCloseFirst` is `2026-10`

#### Scenario: Anonymous and unknown month
- **WHEN** the endpoint is called without a session, or with `month=2019-01` that has no period
- **THEN** the responses are `401 UNAUTHENTICATED` and `404 NOT_FOUND`
