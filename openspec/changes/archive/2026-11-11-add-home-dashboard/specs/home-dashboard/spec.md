## Purpose

The role-aware Home read model and its `GET /api/v1/dashboard` endpoint: one summary of the viewer's own money, the house's current month and the bookkeeper's jobs, computed with the same rules as the detail pages so Home never disagrees with them. (Home PRD §3, F1–F9, F12, §7; main PRD S2, §5.7, §9 `GET /dashboard`)

## ADDED Requirements

### Requirement: Dashboard endpoint
The system SHALL expose `GET /api/v1/dashboard` to any logged-in user, returning the Home summary in the standard `ok` envelope with `Cache-Control: no-store`. It MUST be documented in the OpenAPI document. Anonymous calls MUST get `401`. The response SHALL contain `month`, `house` and `activity` for everyone; `me` and `myRequest` only when the viewer is linked to an owner; `desk`, `reminders`, `setup` and `quickActions` only when the viewer has `dashboard.admin`. Keys that do not apply to the viewer MUST be `null`, never filled with another person's data. (Home PRD §3, Rule 6, main PRD §9)

#### Scenario: Owner response
- **WHEN** an Owner linked to an owner record calls `GET /api/v1/dashboard`
- **THEN** the response is `200` with `me` filled and `desk`, `reminders`, `setup` and `quickActions` all `null`

#### Scenario: Super Admin who is not an owner
- **WHEN** a Super Admin with no linked owner calls the endpoint
- **THEN** `me` and `myRequest` are `null` and `desk` is filled

#### Scenario: Anonymous
- **WHEN** the endpoint is called without a session
- **THEN** it answers `401` in the `fail` envelope

#### Scenario: Documented
- **WHEN** `/api/v1/openapi.json` is fetched
- **THEN** it contains the `GET /dashboard` operation and its response schema

### Requirement: Current month
The dashboard month SHALL be the latest OPEN period; when no period is open it SHALL be the latest CLOSED period with `open: false`; when no period exists it SHALL be `null`. The month object MUST carry the month key, `open`, and `firstMonth` (no month has ever been closed); the response MUST carry the house name as `houseName` even when `month` is `null`. (Rule 1, G1, F12)

#### Scenario: October open
- **WHEN** only 2026-10 is open
- **THEN** `month.key` is `2026-10` and `month.open` is true

#### Scenario: Nothing open
- **WHEN** 2026-09 and 2026-10 are both closed
- **THEN** `month.key` is `2026-10` and `month.open` is false

### Requirement: Personal balance figures
For a viewer linked to an owner, `me` SHALL contain the owner id, current balance in paisa, its label (`OWED` when > 0, `ADVANCE` when < 0, `SETTLED` when 0), share percent in force for the current month (null when the owner holds no units), the entitlement preview for the current open month (null when the month is closed or the owner has no share), payouts posted in the current month, advances posted in the current month, total loan outstanding, and the active loan with the nearest next deduction (number, outstanding, instalment, month) when any. Each figure MUST equal the same figure on the Owners page, the owner statement, the Distribution board row for the current month, and Advances & Loans respectively. Voided entries and their reversals MUST NOT count. (F2, F3, G3, G14, Rule 2, Rule 3)

#### Scenario: Nasrin's figures (PRD §9)
- **WHEN** Nasrin (40%) has balance −500000 paisa, October preview entitlement 3382760, October payouts 3481560, October advances 500000 and no loan
- **THEN** `me` shows balancePaisa −500000, label `ADVANCE`, sharePercent 40, entitlementPreviewPaisa 3382760, receivedPaisa 3481560, advancesPaisa 500000, loanOutstandingPaisa 0

#### Scenario: Matches Distribution
- **WHEN** the Distribution board for the current month shows a viewer's entitlement of 2114225 paisa
- **THEN** `me.entitlementPreviewPaisa` is 2114225

#### Scenario: Voided payout excluded
- **WHEN** a 1000000 paisa payout this month is voided
- **THEN** `me.receivedPaisa` excludes it and `me.balancePaisa` equals the statement's closing balance

### Requirement: My request status
For a viewer linked to an owner, `myRequest` SHALL be their newest request in PENDING or APPROVED status (type, requested and approved amounts in paisa, status, id); when none is open it SHALL be their newest REJECTED or DISBURSED request whose decision they have not seen yet, marked `once: true`; otherwise `null`. (F4)

#### Scenario: Pending advance
- **WHEN** Nasrin has a PENDING advance request for 1000000 paisa
- **THEN** `myRequest` has type `ADVANCE`, status `PENDING`, amountRequestedPaisa 1000000 and `once` false

#### Scenario: Seen rejection disappears
- **WHEN** the viewer's only request was REJECTED and they already opened Requests
- **THEN** `myRequest` is `null`

### Requirement: Bookkeeper's desk figures
For `dashboard.admin`, `desk` SHALL contain: House fund total and each **active** fund account (name, type, balance) where the total equals the sum of those balances; pending requests (count of PENDING, equal to the Requests "Needs your decision" count) and how many have waited over 3 days; open complaints (count of Open + In review from the notices provider); invites waiting (users with status INVITED) and how many of their latest invite links have expired; and the reconciliation result. (F5, G9, Rule 10, PAY-04)

#### Scenario: Fund total
- **WHEN** active accounts are Cash 3100000 and DBBL savings 9350875 paisa and an inactive account holds 0
- **THEN** `desk.fund.totalPaisa` is 12450875 and two accounts are listed

#### Scenario: Expired invite counted
- **WHEN** two users are INVITED and one's newest invite token expired yesterday
- **THEN** `desk.invites` is `{ waiting: 2, expired: 1 }`

#### Scenario: Complaints before Notices exists
- **WHEN** the Notices & Complaints section is not installed
- **THEN** `desk.openComplaints` is 0

### Requirement: Fund reconciliation
The system SHALL compute `FundBalance = Σ OwnerBalance + ReserveBalance + OpenPeriodNet − DeficitCarried − LoanOutstanding` (main PRD §5.7) in paisa where: House fund is the active-account total; Σ OwnerBalance is every owner's ledger balance; ReserveBalance is the Distribution reserve balance; OpenPeriodNet is, over every OPEN period, income minus expenses not paid from the reserve; DeficitCarried is the deficit carried out of the latest CLOSED month; LoanOutstanding is the outstanding of all active loans. The result SHALL be `BALANCED` only when both sides are equal to the paisa, else `CHECK` with `mismatchPaisa = fund − expected`. The breakdown MUST list each part's value. The formula MUST live in the pure accounting module. (F5, G8, Rule 8)

#### Scenario: Balanced house
- **WHEN** fund 12450875, owner balances 12000000, reserve 445100, open net 5775, deficit 0, loans 0
- **THEN** status is `BALANCED` and mismatchPaisa is 0

#### Scenario: Cash short by ৳2,000
- **WHEN** the expected side is 12450875 and the fund is 12250875
- **THEN** status is `CHECK` and mismatchPaisa is −200000

#### Scenario: Loan disbursal keeps balance
- **WHEN** a balanced house disburses a 1000000 paisa loan from the fund
- **THEN** the status stays `BALANCED`

### Requirement: Reminder timing
For `dashboard.admin`, `reminders` SHALL list at most two items, most urgent first in this order: **CLOSE_MONTH** — today (Asia/Dhaka) is in a later month than an OPEN period; carries that month and its unpaid units; **RENT_STATUS** — today is on or after the 10th of the current month, the current month is open, and active units with rent have no non-voided income entry in it; carries the units with tenant names; **APPROVED_UNPAID** — an APPROVED request's needed-by date is before today; carries owner, amount, type and date. Each reminder MUST carry a stable `kind` so it can be hidden per day. (F6, G4, Rule 9)

#### Scenario: Day 9 no rent reminder
- **WHEN** today is 2026-10-09 and Flat 3A has no rent for October
- **THEN** no `RENT_STATUS` reminder is returned

#### Scenario: Day 10 rent reminder
- **WHEN** today is 2026-10-10 and Flat 3A (Nusrat Jahan) has no rent for October
- **THEN** a `RENT_STATUS` reminder lists Flat 3A with tenant Nusrat Jahan

#### Scenario: Month-end
- **WHEN** today is 2026-11-01 and October is still open
- **THEN** the first reminder is `CLOSE_MONTH` for 2026-10

#### Scenario: Cap at two
- **WHEN** all three reminder conditions are true
- **THEN** only `CLOSE_MONTH` and `RENT_STATUS` are returned

### Requirement: House this month
`house` SHALL contain the current month's staircase exactly as Distribution shows it for that month (income, expense, reserve, previous deficit, distributable, in paisa), whether the month is a draft (open), and the shortfall in paisa when expenses exceed income so far (else 0). With no open month (or no period at all), `house` MUST be `null` (F12: staircase hidden). (F7, Rule 4)

#### Scenario: Worked example
- **WHEN** October has income 10300000, expense 1398000, reserve 445100 and previous deficit 0
- **THEN** `house` shows distributablePaisa 8456900, draft true and shortfallPaisa 0

#### Scenario: Deficit building
- **WHEN** income is 500000 and expenses are 800000 so far
- **THEN** shortfallPaisa is 300000

### Requirement: Latest activity
`activity` SHALL list the 6 newest money events of the house, newest first by date then creation time, across: income and expense entries, owner payouts and advances, loans disbursed and loan repayments. Voided entries, void reversals, cancelled loans and reversed repayments MUST NOT appear. Each item SHALL carry kind, date, title data (category, or owner name for payout/advance/loan/repayment), sub-line (description, or method · reference), signed amount in paisa (positive for money in, negative for money out), and a link target (entry id, or owner id). Every logged-in viewer sees the same list. (F8, Rule 5, Rule 6)

#### Scenario: Six newest
- **WHEN** the house has 9 non-voided events this month
- **THEN** 6 items are returned, the first being the latest by date

#### Scenario: Voided hidden
- **WHEN** the newest expense is voided
- **THEN** it and its reversal are absent and the 7th-newest event moves into the list

#### Scenario: Advance row
- **WHEN** a 500000 paisa advance to Nasrin Ahmed by Bank ref TX4134 is the newest event
- **THEN** the first item has kind `ADVANCE`, owner "Nasrin Ahmed", sub-line data method BANK and reference TX4134, and amountPaisa −500000

### Requirement: Pinned notices seam
`notices` SHALL hold up to 3 pinned notices newest first (id, title, body, urgent, date, unread) and `noticesMore` whether more exist, read through a single notices provider. Until the Notices & Complaints section exists the provider MUST return an empty list and zero open complaints, with no database tables added for it. (F9, NTC-01)

#### Scenario: No notices section yet
- **WHEN** any user calls the endpoint
- **THEN** `notices` is an empty array and `noticesMore` is false

### Requirement: Setup checklist
For `dashboard.admin`, `setup` SHALL list six steps — House info, Fund accounts, Owners & shares, Opening balances, First month, Invite owners — each `done` true/false, and `complete` when all are done; `setup` MUST be `null` once complete. A step is done when: the property has a name; at least one active fund account exists; a share set with units exists; at least one OPENING ledger entry exists or a month has been closed; at least one period exists; at least one owner other than the viewer's own owner record is linked to a login (ACTIVE or INVITED). (F12)

#### Scenario: Fresh install
- **WHEN** a property has a name and nothing else
- **THEN** House info is done and the other five steps are not

#### Scenario: Finished setup hides checklist
- **WHEN** all six conditions hold
- **THEN** `setup` is `null`

### Requirement: Quick action availability
For `dashboard.admin`, `quickActions` SHALL say whether a month is open and whether **Generate this month's rent** applies (some active unit with rent has no rent income in the current open month). With no open month both MUST be false. (F1, Rule 7)

#### Scenario: All rent recorded
- **WHEN** every active unit has rent income in the open month
- **THEN** `quickActions.generateRent` is false and `quickActions.monthOpen` is true
