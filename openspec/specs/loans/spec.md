# loans Specification

## Purpose

Records loans to owners as a separate ledger from their entitlement balance, so that paying an owner more than they are owed can be booked as a loan and its outstanding amount shown on the owner's card. Repayments and instalments come with the Advances & Loans section. (PRD §5.5; PAY-03; ADV-02 disbursement only; Owners PRD F1, F2, F11)

## Requirements

### Requirement: Loan record
A loan SHALL hold property, owner, principal in paisa (> 0), disbursed-on date, fund account, method, reference no., reason, an optional monthly instalment in paisa (> 0 when set), status (`ACTIVE`, `REPAID`, `WRITTEN_OFF`; created `ACTIVE`), the PAYOUT entry it was split from (optional), recorded-by and created-at. Loans MUST NOT be deleted. Disbursing a loan MUST NOT change the owner's ledger balance; only loan deductions posted on month close do. (§5.5; ADV-02)

#### Scenario: Loan leaves the balance alone
- **WHEN** a payout split records a loan of 494415 paisa for an owner whose balance was 805585
- **THEN** the owner's balance is 0 (only the PAYOUT −805585 counts) and the loan is ACTIVE with principal 494415

### Requirement: Loan from a payout split
When `POST /api/v1/payouts` is sent with `splitExcessAs: "LOAN"`, the system SHALL create one loan of the excess in the same transaction as the PAYOUT, using the payout's date, fund account, method and reference, with reason = `excessReason` or, if blank, "Paid beyond balance", the optional `loanInstallmentPaisa` (> 0, ≤ the loan principal) as its instalment, and write `loan.created`. (PAY-03)

#### Scenario: Split as loan
- **WHEN** Tanvir (balance 805585) is paid 1300000 with `splitExcessAs: "LOAN"` and `loanInstallmentPaisa: 100000`
- **THEN** the response has one PAYOUT −805585 and `loan.principalPaisa: 494415` with `installmentPaisa: 100000`, and Tanvir's balance is 0

#### Scenario: Instalment above principal
- **WHEN** `loanInstallmentPaisa` is larger than the excess
- **THEN** the response is `422 VALIDATION_FAILED` and nothing is written

### Requirement: Loan outstanding
A loan's outstanding SHALL be its principal minus Σ |amount| of its non-voided LOAN_DEDUCTION entries, computed on read. An owner's loan outstanding SHALL be Σ outstanding of their ACTIVE loans, returned on the owner list, owner detail and distribution board as `loanOutstandingPaisa` (0 shown as "None"). (F1, F2; main PRD §5.5)

#### Scenario: Outstanding after a deduction
- **WHEN** Tanvir has one ACTIVE loan of 3500000 and October's close deducted 500000
- **THEN** his `loanOutstandingPaisa` is 3000000

### Requirement: Set a loan instalment
`PATCH /api/v1/loans/{id}` (permission `loan.manage`) with `{ installmentPaisa: number | null }` SHALL set or clear the monthly instalment of an ACTIVE loan; a value above the loan's outstanding returns `422`, a non-ACTIVE loan `409 LOAN_NOT_ACTIVE`, an unknown id `404`. Audit `loan.updated` with before/after. The change applies to the next close. (F11; ADV-02)

#### Scenario: Set instalment
- **WHEN** a Super Admin patches Tanvir's loan with `{ installmentPaisa: 500000 }`
- **THEN** the response is `200` with `installmentPaisa: 500000` and October's preview shows Loan ded. 500000 for Tanvir

#### Scenario: Owner refused
- **WHEN** an Owner patches a loan
- **THEN** the response is `403 FORBIDDEN`
