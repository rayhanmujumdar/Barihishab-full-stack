# loans Specification

## Purpose

Records loans to owners as a separate ledger from their entitlement balance, so that paying an owner more than they are owed can be booked as a loan and its outstanding amount shown on the owner's card. Repayments and instalments come with the Advances & Loans section. (PRD §5.5; PAY-03; ADV-02 disbursement only; Owners PRD F1, F2, F11)

## Requirements

### Requirement: Loan record
A loan SHALL hold property, owner, principal in paisa (> 0), disbursed-on date, fund account, method, reference no., reason, status (`ACTIVE`, `REPAID`, `WRITTEN_OFF`; created `ACTIVE`), the PAYOUT entry it was split from (optional), recorded-by and created-at. Loans MUST NOT be deleted. A loan MUST NOT change the owner's ledger balance. (§5.5)

#### Scenario: Loan leaves the balance alone
- **WHEN** a payout split records a loan of 494415 paisa for an owner whose balance was 805585
- **THEN** the owner's balance is 0 (only the PAYOUT −805585 counts) and the loan is ACTIVE with principal 494415

### Requirement: Loan from a payout split
When `POST /api/v1/payouts` is sent with `splitExcessAs: "LOAN"`, the system SHALL create one loan of the excess in the same transaction as the PAYOUT, using the payout's date, fund account, method and reference, with reason = `excessReason` or, if blank, "Paid beyond balance", and write `loan.created`. (PAY-03)

#### Scenario: Split as loan
- **WHEN** Tanvir (balance 805585) is paid 1300000 with `splitExcessAs: "LOAN"`
- **THEN** the response has one PAYOUT −805585 and `loan.principalPaisa: 494415`, and Tanvir's balance is 0

### Requirement: Loan outstanding
An owner's loan outstanding SHALL be Σ principal of their ACTIVE loans (repayments do not exist yet), computed on read, and returned on the owner list and detail as `loanOutstandingPaisa` (0 shown as "None"). (F1, F2)

#### Scenario: Outstanding shown
- **WHEN** Tanvir has one ACTIVE loan of 3500000
- **THEN** his list item has `loanOutstandingPaisa: 3500000`
