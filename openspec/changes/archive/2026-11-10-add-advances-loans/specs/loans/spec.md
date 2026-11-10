## MODIFIED Requirements

### Requirement: Loan record
A loan SHALL hold property, a loan number (sequential per property from 1, shown as "L{n}", never reused — cancelled loans keep theirs), owner, principal in paisa (> 0), disbursed-on date, fund account, method, reference no. (required except Cash), reason (1–300, visible to every owner), an optional monthly instalment in paisa (> 0 when set), status (`ACTIVE`, `REPAID`, `WRITTEN_OFF`, `CANCELLED`; created `ACTIVE`), origin (`DIRECT` or `PAYOUT_SPLIT`), `isSelf` (true when the owner is linked to the acting user), `flagged` (true when the owner already had an ACTIVE loan), the PAYOUT entry it was split from (optional), recorded-by and created-at. Loans and their movements MUST NOT be deleted. Disbursing a loan MUST NOT change the owner's ledger balance; only LOAN_DEDUCTION entries (on close or manual) and their reversals do. Existing loans SHALL be numbered by creation order and marked `PAYOUT_SPLIT`. (§5.5; ADV-02; Advances & Loans PRD Rules 1, 2, 7, 9, 11, 13)

#### Scenario: Loan leaves the balance alone
- **WHEN** a payout split records a loan of 494415 paisa for an owner whose balance was 805585
- **THEN** the owner's balance is 0 (only the PAYOUT −805585 counts) and the loan is ACTIVE with principal 494415

#### Scenario: Numbers are sequential and never reused
- **WHEN** L1 and L2 exist, L2 is cancelled and a new loan is created
- **THEN** the new loan is L3

#### Scenario: Delete refused
- **WHEN** a raw `DELETE FROM loans` or `DELETE FROM loan_movements` runs
- **THEN** the database raises and the row remains

### Requirement: Loan from a payout split
When `POST /api/v1/payouts` is sent with `splitExcessAs: "LOAN"`, the system SHALL create one loan of the excess in the same transaction as the PAYOUT, with the next loan number, origin `PAYOUT_SPLIT`, the payout's date, fund account, method and reference, reason = `excessReason` or, if blank, "Paid beyond balance", the optional `loanInstallmentPaisa` (> 0, ≤ the loan principal) as its instalment, and write `loan.created`. (PAY-03)

#### Scenario: Split as loan
- **WHEN** Tanvir (balance 805585) is paid 1300000 with `splitExcessAs: "LOAN"` and `loanInstallmentPaisa: 100000`
- **THEN** the response has one PAYOUT −805585 and `loan.principalPaisa: 494415` with `installmentPaisa: 100000`, `origin: "PAYOUT_SPLIT"` and a loan number, and Tanvir's balance is 0

#### Scenario: Instalment above principal
- **WHEN** `loanInstallmentPaisa` is larger than the excess
- **THEN** the response is `422 VALIDATION_FAILED` and nothing is written

### Requirement: Loan outstanding
A loan's outstanding SHALL be computed on read as principal + Σ its linked owner-ledger entries (LOAN_DEDUCTION negative, their REVERSALs positive) + Σ its loan movements (cash repayment negative, its reversal positive, cancellation −principal, write-off −outstanding). Repaid SHALL be Σ non-voided cash repayments + Σ non-voided deductions; progress = repaid ÷ principal. An owner's loan outstanding SHALL be Σ outstanding of their ACTIVE loans, returned on the owner list, owner detail and distribution board as `loanOutstandingPaisa` (0 shown as "None"). (F1, F2; Advances & Loans PRD §7.1)

#### Scenario: Outstanding after a deduction
- **WHEN** Tanvir has one ACTIVE loan of 3500000 and October's close deducted 500000
- **THEN** his `loanOutstandingPaisa` is 3000000

#### Scenario: Cash and deduction together
- **WHEN** L2 of 5000000 has deductions of 500000 × 3 and one cash repayment of 1000000, and that cash repayment is then voided
- **THEN** the outstanding is 2500000 before the void and 3500000 after, and repaid is 1500000 after the void

### Requirement: Set a loan instalment
`PATCH /api/v1/loans/{id}` (permission `loan.manage`) with `{ installmentPaisa: number | null, reason (1–300) }` SHALL set or clear ("Manual") the monthly instalment of an ACTIVE loan; a value above the loan's outstanding returns `422`, a blank reason `422` "A reason is required — every owner can see it.", a non-ACTIVE loan `409 LOAN_NOT_ACTIVE`, an unknown id `404`. Audit `loan.updated` with before/after instalment and the reason. The change applies from the next close, and the response carries the new expected finish month. (Advances & Loans PRD F7, G3; ADV-02)

#### Scenario: Set instalment
- **WHEN** a Super Admin patches Tanvir's loan with `{ installmentPaisa: 500000, reason: "Agreed at family meeting" }`
- **THEN** the response is `200` with `installmentPaisa: 500000` and October's preview shows Loan ded. 500000 for Tanvir

#### Scenario: Lower instalment moves the finish month
- **WHEN** L2 has 3000000 outstanding after October's close and the instalment is changed from 500000 to 300000 with reason "Reduced until March at owner's request"
- **THEN** `expectedFinishMonth` changes from "2027-04" to "2027-08" and the `loan.updated` audit row carries the reason

#### Scenario: Reason missing
- **WHEN** the patch has no reason
- **THEN** the response is `422` and the instalment is unchanged

#### Scenario: Owner refused
- **WHEN** an Owner patches a loan
- **THEN** the response is `403 FORBIDDEN`

## ADDED Requirements

### Requirement: Create a loan
`POST /api/v1/loans` (permission `loan.create`, `Idempotency-Key` required) SHALL accept `{ ownerId, amountPaisa (> 0), date, fundAccountId, method, referenceNo?, installmentPaisa? (> 0, ≤ amount), reason (1–300), attachmentIds? }` with the payout date, fund, method and reference rules, and in one transaction create an ACTIVE loan with the next number and origin `DIRECT`, lowering the fund account by the amount and leaving the owner's balance unchanged. It MUST need an OPEN month (`409 NO_OPEN_PERIOD` "Open a month first — loans and repayments are recorded in an open month."). The response `201 { loan, warnings }` SHALL carry non-blocking warnings: `OWNER_HAS_LOAN { loanNumber, outstandingPaisa }` (the loan is then `flagged`), `INSTALMENT_ABOVE_SHARE { averageSharePaisa }` when the instalment exceeds the owner's average entitlement of the last 3 closed months, `FUND_SHORT` / `HOUSE_FUND_SHORT` as for payouts. Audit `loan.created` with the reason. (F4, G9, G12, G15; ADV-01)

#### Scenario: New loan
- **WHEN** a Super Admin lends Tanvir 5000000 by bank with reference "TRX-88", instalment 500000, reason "Daughter's school admission"
- **THEN** the response is `201` with the loan number, status ACTIVE, outstanding 5000000; the bank account balance drops by 5000000 and Tanvir's balance is unchanged

#### Scenario: Owner already has a loan
- **WHEN** Tanvir already has L2 with 3500000 outstanding and a new loan is created for him
- **THEN** the loan is saved with `flagged: true` and warning `OWNER_HAS_LOAN { loanNumber: 2, outstandingPaisa: 3500000 }`

#### Scenario: Reason and reference required
- **WHEN** the reason is blank, or the method is BANK and `referenceNo` is empty
- **THEN** the response is `422` naming the field and nothing is written

#### Scenario: Self loan
- **WHEN** the Super Admin lends to the owner linked to their own user
- **THEN** the loan has `isSelf: true`

#### Scenario: Owner refused
- **WHEN** an Owner posts a loan
- **THEN** the response is `403 FORBIDDEN`

### Requirement: Record a repayment
`POST /api/v1/loans/{id}/repayments` (permission `loan.repay`, `Idempotency-Key` required) SHALL accept `{ mode: "CASH" | "DEDUCTION", amountPaisa (> 0), date, fundAccountId?, method?, referenceNo? }` for an ACTIVE loan, posted in the latest OPEN month. CASH requires an active fund account and method (reference required except Cash) and records a cash repayment that raises that fund account and leaves the owner's balance unchanged. DEDUCTION records a LOAN_DEDUCTION ledger entry (negative, no fund account, linked to the loan) that lowers the owner's balance and leaves every fund account unchanged. An amount above the outstanding MUST return `422` on `amountPaisa` "Only ৳X is outstanding on L{n}."; a deduction above the owner's current positive balance MUST return `422` on `amountPaisa` "{Name}'s balance is ৳X — you can deduct up to that. Use cash for the rest."; a non-ACTIVE loan `409 LOAN_NOT_ACTIVE`; no open month `409 NO_OPEN_PERIOD`. When the outstanding reaches 0 the loan becomes REPAID. The response `201 { loan, movement, balancePaisa }` returns the owner's balance. Audit `loan.repaid_cash` or `loan.repaid_deduction`. (F5, G1, G2; Rules 3, 4, 8, 13; ADV-02)

#### Scenario: Cash repayment
- **WHEN** Farzana's L1 (2000000 outstanding) gets a 1000000 CASH repayment into Cash
- **THEN** L1's outstanding is 1000000, Cash rises by 1000000 and Farzana's balance is unchanged

#### Scenario: Fully repaid
- **WHEN** the second 1000000 cash repayment is recorded on L1
- **THEN** L1's status is REPAID and its outstanding is 0

#### Scenario: Above the outstanding
- **WHEN** a repayment of 1000001 is posted on a loan with 1000000 outstanding
- **THEN** the response is `422` "Only ৳10,000 is outstanding on L1." and nothing is written

#### Scenario: Deduction within the balance
- **WHEN** Tanvir's balance is 805585 and a 500000 DEDUCTION is posted on L2
- **THEN** his balance is 305585, L2's outstanding drops by 500000 and no fund account changes

#### Scenario: Deduction above the balance
- **WHEN** Tanvir's balance is 300000 and a 500000 DEDUCTION is posted
- **THEN** the response is `422` "Tanvir Ahmed's balance is ৳3,000 — you can deduct up to that. Use cash for the rest."

#### Scenario: Owner refused
- **WHEN** an Owner posts a repayment
- **THEN** the response is `403 FORBIDDEN`

### Requirement: Void a repayment
`POST /api/v1/loans/{id}/repayments/{repaymentId}/void` (permission `loan.manage`) with `{ reason (1–300) }` SHALL, in one transaction in the latest OPEN month, mark a cash repayment or a manual deduction of that loan voided (`voidedAt`, `voidedBy`, `voidReason`) and post a reversal of the opposite amount dated today: for cash the fund account goes back down; for a deduction a ledger REVERSAL linked to the loan raises the owner's balance. The outstanding goes back up and a REPAID loan becomes ACTIVE. Deductions posted by a month close MUST return `409 NOT_VOIDABLE` ("Instalments taken at close change only by reopening that month."); an already voided repayment `409 ALREADY_VOIDED`; a CANCELLED or WRITTEN_OFF loan `409 LOAN_NOT_ACTIVE`; an id that isn't a repayment of this loan `404`. Concurrent voids MUST produce exactly one reversal. Audit `loan.repayment_voided` with the reason. (F8, G4; Rule 7)

#### Scenario: Void a cash repayment
- **WHEN** a 1000000 cash repayment on L1 is voided with reason "Recorded on the wrong loan"
- **THEN** L1's outstanding, Cash and Farzana's balance all equal their values before the repayment, and the history shows the original struck through plus a Reversal

#### Scenario: Close-posted instalment
- **WHEN** a LOAN_DEDUCTION posted by October's close is voided here
- **THEN** the response is `409 NOT_VOIDABLE` and nothing changes

#### Scenario: Repaid loan becomes active
- **WHEN** the repayment that made L1 REPAID is voided
- **THEN** L1 is ACTIVE with that amount outstanding

### Requirement: Cancel a loan
`POST /api/v1/loans/{id}/cancel` (permission `loan.manage`) with `{ reason (1–300) }` SHALL cancel an ACTIVE loan that has no non-voided repayments (cash or deduction): in one transaction in the latest OPEN month it records a cancellation movement that returns the principal to the loan's fund account, sets status CANCELLED (outstanding 0) and keeps the loan visible. A loan with repayments MUST return `409 LOAN_HAS_REPAYMENTS` ("This loan has repayments, so it can't be cancelled. Void the repayments first or write it off."); a non-ACTIVE loan `409 LOAN_NOT_ACTIVE`. Audit `loan.cancelled` with the reason. (F9; Rule 7)

#### Scenario: Wrong owner
- **WHEN** a 2000000 loan from Bank with no repayments is cancelled with reason "Recorded for the wrong owner"
- **THEN** its status is CANCELLED, Bank is back to its value before the loan and the owner's loan outstanding excludes it

#### Scenario: Has repayments
- **WHEN** a loan with one non-voided cash repayment is cancelled
- **THEN** the response is `409 LOAN_HAS_REPAYMENTS`

### Requirement: Write off a loan
`POST /api/v1/loans/{id}/write-off` (permission `loan.manage`) with `{ reason (1–300) }` SHALL, for an ACTIVE loan, in one transaction in the latest OPEN month: record a write-off movement of the outstanding, set status WRITTEN_OFF (outstanding 0), and book a house EXPENSE of that amount in the open month in system category "Loan written off" (`LOAN_WRITTEN_OFF`) on the loan's fund account with description "L{n} written off · {reason}", so it is shared by all owners through the month's distributable. The write-off movement offsets the expense on that fund account, so no fund balance changes. Audit `loan.written_off` with the reason. (F10, G8, P2)

#### Scenario: Write off
- **WHEN** L2 with 3000000 outstanding is written off with reason "Hardship agreed by the family"
- **THEN** L2 is WRITTEN_OFF with outstanding 0, the open month has a 3000000 "Loan written off" expense, and every fund balance is unchanged

#### Scenario: Not active
- **WHEN** a REPAID loan is written off
- **THEN** the response is `409 LOAN_NOT_ACTIVE`

### Requirement: Expected finish and next deduction
For an ACTIVE loan with an instalment, months left SHALL be ⌈outstanding ÷ instalment⌉, the first remaining instalment month SHALL be the later of the month after disbursement and the earliest OPEN month, and the expected finish month SHALL be first month + months left − 1. The next deduction SHALL be min(instalment, outstanding) when that first month closes. Manual loans (no instalment) and non-ACTIVE loans have neither. (§7.2, F6, G10)

#### Scenario: L2 after October
- **WHEN** L2 (disbursed 2026-06-10, instalment 500000) has 3000000 outstanding and November is the earliest open month
- **THEN** `expectedFinishMonth` is "2027-04" and `nextDeduction` is `{ amountPaisa: 500000, month: "2026-11" }`

#### Scenario: New loan waits a month
- **WHEN** a 5000000 loan with instalment 500000 is disbursed on 2026-06-10 while June is open
- **THEN** `expectedFinishMonth` is "2027-04" and `nextDeduction.month` is "2026-07"

### Requirement: Loan list and summary
`GET /api/v1/loans` (permission `loan.view`) with optional `ownerId` and `status` filters SHALL return `{ loans, summary }`: loans newest first (disbursed date, then number), each with id, number, owner id and name, status, isSelf, flagged, origin, reason, principal, disbursed date, instalment, repaid, outstanding, expected finish month, next deduction and its last 3 movements; and `summary { loansOutstandingPaisa, activeLoans }` over all loans regardless of filters. Invalid filters return `422`. (F1, F2, G7)

#### Scenario: Filter by status
- **WHEN** L1 is REPAID and L2 ACTIVE and the list is read with `status=ACTIVE`
- **THEN** only L2 is returned while `summary` still reports 3000000 outstanding over 1 active loan

#### Scenario: Owner can read
- **WHEN** an Owner reads the list
- **THEN** the response is `200` with every owner's loans

### Requirement: Loan detail and movement history
`GET /api/v1/loans/{id}` (permission `loan.view`) SHALL return the loan with fund account name, method, reference no., source (`DIRECT` / `PAYOUT_SPLIT` with the payout entry id), repaid in cash, repaid by deduction, outstanding, instalment, expected finish month, and: `movements` oldest first — Disbursed, Repaid in cash, Deducted from entitlement (with `onClose`), Reversal, Cancelled, Written off, and Instalment skipped notes from closed months' snapshots — each with date, amount, running outstanding, recorded-by, note, `voided`/`voidReason` and `voidable`; and `changes` — instalment changes and status changes (cancelled, written off, repayment voided) with who, when, before/after and reason. Unknown id `404`. (F3, F6, F8)

#### Scenario: L2 history
- **WHEN** L2 was disbursed 5000000 on 2026-06-10 and July–October closes deducted 500000 each
- **THEN** the movements are Disbursed 5000000 (running 5000000) then four "Deducted from entitlement" rows dated each month's last day with running 4500000, 4000000, 3500000, 3000000, none voidable

#### Scenario: Skipped instalment noted
- **WHEN** a closed month's snapshot lists L2 as skipped
- **THEN** the movements include "Instalment skipped" for that month with amount 0
