## MODIFIED Requirements

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
