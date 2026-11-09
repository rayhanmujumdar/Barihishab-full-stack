## MODIFIED Requirements

### Requirement: Fund accounts with live balance
The system SHALL provide `GET /api/v1/fund-accounts` (permission `transaction.view`), `POST` and `PATCH /api/v1/fund-accounts/:id` (permission `fund.manage`). A fund account has a name (1–60 chars), type `CASH` / `BANK` / `WALLET`, opening balance in paisa (may be 0 or negative), opening date and active flag. Every account returned MUST include `balancePaisa` = opening balance + Σ non-voided income − Σ non-voided expense booked to it (including From-Reserve expenses) + Σ owner ledger entries booked to it (payouts and advances are negative, their reversals positive) − Σ principal of every loan disbursed from it, whatever the loan's status (loan deductions move no cash). The same balance MUST drive the `FUND_NEGATIVE` / `FUND_SHORT` warnings. Deactivation MUST be refused with `409 FUND_NOT_EMPTY` while the balance is not 0. Type and opening balance MAY be edited; accounts MUST NOT be deletable. (MST-02, FND-01, §11; PRD §9.5 `v_fund_balance`)

#### Scenario: Balance reflects entries
- **WHEN** Cash opened at 200000 paisa, receives 1800000 paisa income and pays 630000 paisa expense, and a 50000 paisa expense on it is voided
- **THEN** its `balancePaisa` is 1370000

#### Scenario: Owner payouts and loans reduce the fund
- **WHEN** Cash holds 1370000 paisa, an owner is paid 400000 from it, a 100000 advance from it is voided (reversal posted), and a 200000 loan is disbursed from it
- **THEN** its `balancePaisa` is 770000

#### Scenario: Repaid loan keeps the fund unchanged
- **WHEN** a 200000 loan from Cash is fully repaid by loan deductions on close and becomes REPAID
- **THEN** Cash's `balancePaisa` is the same as before the close

#### Scenario: Deactivate with money in it
- **WHEN** a Super Admin deactivates an account whose balance is 1370000 paisa
- **THEN** the response is `409 FUND_NOT_EMPTY`

#### Scenario: Deactivate at zero
- **WHEN** the account balance is 0 and it is deactivated
- **THEN** the response is `200` with `isActive: false`, and a `fund_account.updated` audit row exists
