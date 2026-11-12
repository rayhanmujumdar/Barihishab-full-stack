# month-close Specification

## Purpose

Lets the Super Admin close a month safely — checklist, plain summary, all-or-nothing posting of entitlements and loan instalments, lock — and fix the latest closed month openly through a reasoned reopen whose effect is visible as reversals and a before → after summary. (Distribution PRD F5–F8, F11, §7.5, §8; main PRD §5.1, DST-02–DST-04)

## Requirements

### Requirement: Close checklist and preview
`GET /api/v1/periods/{month}/close-preview` (permission `period.close`) SHALL return must-pass checks, warnings, the "What happens" list and, for a reopened month, the changes since the last close. Must-pass checks (any failure blocks close): (1) a share set is in force for the month with total units > 0 ("No shares set for {Month}. Set shares in Owners first."); (2) the previous month is closed or none exists; (3) Σ entitlements = Distributable; (4) the month is still open. Warnings (close allowed): no income entries; active units with rent > 0 and no non-voided income entry for that unit in the month (listed by unit and tenant); expenses with no attachment (count); the month has not ended in Asia/Dhaka; the reserve balance would go negative; complaints in OPEN or IN_REVIEW whose linked month is this month (count, any visibility: "{n} open complaint(s) about {Month}."). "What happens" SHALL list the number and total of entitlements, one line per loan deduction (owner, amount) and per skipped instalment ("{Name}'s instalment skipped — no entitlement this month."), the lock, the share snapshot, and the next month opening when it does not exist. The response SHALL carry the month's `reopenCount` as the version to send with the close. (F5, G1, G2, §9; DST-02; Notices & Complaints PRD C8, Rule 15)

#### Scenario: October checklist
- **WHEN** October has valid shares, September is closed, income exists and Flat 3A (Nusrat Jahan) has no rent entry
- **THEN** all must-pass checks pass, one warning lists "Flat 3A (Nusrat Jahan)", and "What happens" lists 5 entitlements totalling 8456900 and a 500000 loan instalment for Tanvir Ahmed

#### Scenario: Shares missing
- **WHEN** no share set is in force for the month
- **THEN** the shares check fails and `canClose` is false

#### Scenario: Owner refused
- **WHEN** an Owner calls the close preview
- **THEN** the response is `403 FORBIDDEN`

#### Scenario: Open complaint warns, never blocks
- **WHEN** October has one IN_REVIEW complaint linked to an October entry and every must-pass check passes
- **THEN** warnings include `OPEN_COMPLAINTS` with count 1 and `canClose` is true

### Requirement: Months close in order
A month SHALL close only when it is open and every earlier period of the property is closed; otherwise `POST /api/v1/periods/{month}/close` MUST return `409 PREVIOUS_MONTH_OPEN` naming the month to close first ("Close {Month} first — months close in order."). (Rule 1, F5)

#### Scenario: Out of order
- **WHEN** a Super Admin closes November while October is open
- **THEN** the response is `409 PREVIOUS_MONTH_OPEN` and nothing changes

### Requirement: Close a month
`POST /api/v1/periods/{month}/close` (permission `period.close`) with `{ reopenCount }` SHALL, in one transaction, only when every must-pass check passes: post one ENTITLEMENT entry per owner with entitlement > 0, dated the last day of the month, in that month; post loan deductions per the loan instalment rule; save the snapshot (income, expense, reserve-paid expense, reserve and its source, previous deficit, distributable, deficit carried, shares used, each entitlement and loan deduction); set status CLOSED with closed-by and closed-at; open the next month if it does not exist; write audit `period.closed` ("{Month} closed · distributable ৳X"). A failed must-pass check returns `409 CLOSE_BLOCKED` with the failed checks and writes nothing. The response SHALL return the closed month's board. (F5, F6, Rule 4; DST-03)

#### Scenario: Normal close
- **WHEN** a Super Admin closes October (distributable 8456900, Tanvir instalment 500000)
- **THEN** 5 ENTITLEMENT entries summing to 8456900 dated 2026-10-31 exist, one LOAN_DEDUCTION −500000 for Tanvir, October is CLOSED, November exists and is OPEN, and a `period.closed` audit row exists

#### Scenario: Zero distributable still closes
- **WHEN** April (distributable 0) is closed
- **THEN** no ENTITLEMENT entries are posted, the snapshot records Deficit carried 4578000 and April is CLOSED

#### Scenario: Locked after close
- **WHEN** an expense is created in October after it closed
- **THEN** the response is `409 PERIOD_CLOSED`

#### Scenario: Owner refused
- **WHEN** an Owner posts a close
- **THEN** the response is `403 FORBIDDEN` and nothing changes

### Requirement: One close or reopen at a time
Close and reopen MUST lock the period row for update and re-check its status and `reopenCount` inside the transaction. A close of a month that is already CLOSED, or whose `reopenCount` differs from the request, MUST return `409 PERIOD_ALREADY_CLOSED` ("{Month} was just closed by {Name}.") or `409 PERIOD_CHANGED`; two simultaneous closes MUST produce exactly one close. (G12, Rule 5)

#### Scenario: Double close
- **WHEN** two close requests for October run at the same time
- **THEN** one returns `200`, the other `409 PERIOD_ALREADY_CLOSED` with the closer's name, and exactly 5 ENTITLEMENT entries exist

### Requirement: Loan instalment on close
For each ACTIVE loan with a monthly instalment that was disbursed before the first day of the month being closed, processed oldest loan first, close SHALL deduct the smallest of the instalment, the loan outstanding and the owner's entitlement still free after earlier deductions this close, as one LOAN_DEDUCTION ledger entry (negative, no fund account, origin `CLOSE`) linked to the loan, dated the last day of the month. A loan disbursed in the month being closed takes no instalment and is not reported as skipped. A deduction of 0 is skipped and reported. A loan whose outstanding reaches 0 becomes REPAID. Owners without entitlement get no deduction. (F11, G4, §7.5; main PRD §5.5, TC-08; Advances & Loans PRD §7.3)

#### Scenario: TC-08
- **WHEN** an owner with entitlement 1600000 has a loan of 1000000 disbursed in an earlier month with instalment 200000
- **THEN** close posts LOAN_DEDUCTION −200000, the owner nets 1400000 from the month and the loan outstanding is 800000

#### Scenario: Capped by entitlement
- **WHEN** the instalment is 500000 and the owner's entitlement is 300000
- **THEN** the deduction is 300000

#### Scenario: Paid off
- **WHEN** the loan outstanding is 150000 and the instalment 500000 with entitlement 1268535
- **THEN** the deduction is 150000 and the loan becomes REPAID

#### Scenario: Skipped in a deficit month
- **WHEN** the owner's entitlement is 0
- **THEN** no LOAN_DEDUCTION is posted and the preview lists the instalment as skipped

#### Scenario: First instalment the month after disbursement
- **WHEN** a loan with instalment 500000 is disbursed on 2026-06-10 and June is closed
- **THEN** June's close posts no deduction for it and does not list it as skipped, and July's close deducts 500000

#### Scenario: Cash repayment lowers the cap
- **WHEN** a loan has 200000 outstanding after a cash repayment, the instalment is 500000 and the entitlement is 1268535
- **THEN** close deducts 200000 and the loan becomes REPAID

### Requirement: Reopen the latest closed month
`POST /api/v1/periods/{month}/reopen` (permission `period.reopen`) with `{ reason (1–300) }` SHALL succeed only for the latest closed month with no later closed month; otherwise `409 REOPEN_NOT_ALLOWED` ("Only the latest closed month can be reopened. For older months, record an Adjustment in the open month."). In one transaction it SHALL: set the period OPEN and increment `reopenCount`; record a reopen history row (who, when, reason, the snapshot before); mark every non-voided ENTITLEMENT and LOAN_DEDUCTION of the month that the close posted (origin `CLOSE`) voided with the reason and post a REVERSAL for each in that month; set REPAID loans whose outstanding becomes > 0 back to ACTIVE; write audit `period.reopened` with the reason. A month whose close-posted instalment belongs to a loan that has since been WRITTEN_OFF MUST NOT be reopened (`409 REOPEN_NOT_ALLOWED`, "L{n} was written off after this month closed, so its instalments can't be reversed. Record an Adjustment in the open month instead."). Payouts, advances and manual loan deductions MUST stay. A blank reason returns `422` "Please write a reason — everyone can see it.". (F7, G5, G7, Rules 3, 13, 14; DST-04; Advances & Loans PRD F6, Rule 12)

#### Scenario: Reopen September
- **WHEN** September (5 entitlements, one 500000 loan deduction) is reopened with reason "Plumber bill was missed"
- **THEN** September is OPEN with `reopenCount` 1, the 6 originals show voided with 6 matching REVERSAL entries, every owner's balance is back to its value before the close, and a `period.reopened` audit row carries the reason

#### Scenario: Older month refused
- **WHEN** June is reopened while July–September are closed
- **THEN** the response is `409 REOPEN_NOT_ALLOWED` and nothing changes

#### Scenario: Repaid loan reactivated
- **WHEN** the reopened month's deduction had made a loan REPAID
- **THEN** the loan is ACTIVE again with its outstanding restored

#### Scenario: Manual deduction survives a reopen
- **WHEN** a manual 300000 deduction was recorded in September before its close and September is reopened
- **THEN** that deduction stays non-voided while the close-posted entries are reversed

#### Scenario: Written-off loan blocks the reopen
- **WHEN** October's close deducted 500000 from L1 and L1 was written off afterwards, then October is reopened
- **THEN** the response is `409 REOPEN_NOT_ALLOWED` naming L1, October stays CLOSED and no deduction is reversed

### Requirement: Reopen warns about later payouts
The distribution read model for the latest closed month SHALL include the payouts and advances recorded after its close (owner, type, amount, date) and their total, for the reopen dialog. (G5)

#### Scenario: Payout after close
- **WHEN** Farzana was paid 845690 after October closed
- **THEN** October's `paidAfterClose` lists that payout and totals 845690

### Requirement: Re-close shows before → after
For a month with `reopenCount` > 0, the close preview SHALL include and the closed-month record SHALL keep the changes between the snapshot saved before the last reopen and the current (preview or new) values: only staircase lines that changed, and per owner old entitlement → new entitlement → difference. (F8, G6)

#### Scenario: Missed bill
- **WHEN** September was closed with Expense 2678000 and is re-closed after a 500000 expense is added, with a 5 % reserve
- **THEN** the changes show Expense 2678000 → 3178000, Reserve change −25000, Distributable change −475000 and each owner's entitlement difference
