## MODIFIED Requirements

### Requirement: Fund accounts with live balance
The system SHALL provide `GET /api/v1/fund-accounts` (permission `transaction.view`), `POST` and `PATCH /api/v1/fund-accounts/:id` (permission `fund.manage`). A fund account has a name (1–60 chars), type `CASH` / `BANK` / `WALLET`, opening balance in paisa (may be 0 or negative), opening date and active flag. Every account returned MUST include `balancePaisa` = opening balance + Σ non-voided income − Σ non-voided expense booked to it (including From-Reserve expenses) + Σ owner ledger entries booked to it (payouts and advances are negative, their reversals positive) − Σ principal of every loan disbursed from it, whatever the loan's status − Σ loan movements booked to it (cash repayments and cancellations are negative movements and so raise it, their reversals lower it, a write-off movement raises it by the amount its house expense lowers it). Loan deductions move no cash. The same balance MUST drive the `FUND_NEGATIVE` / `FUND_SHORT` warnings. Deactivation MUST be refused with `409 FUND_NOT_EMPTY` while the balance is not 0. Type and opening balance MAY be edited; accounts MUST NOT be deletable. (MST-02, FND-01, §11; PRD §9.5 `v_fund_balance`; Advances & Loans PRD F5, F8–F10)

#### Scenario: Balance reflects entries
- **WHEN** Cash opened at 200000 paisa, receives 1800000 paisa income and pays 630000 paisa expense, and a 50000 paisa expense on it is voided
- **THEN** its `balancePaisa` is 1370000

#### Scenario: Owner payouts and loans reduce the fund
- **WHEN** Cash holds 1370000 paisa, an owner is paid 400000 from it, a 100000 advance from it is voided (reversal posted), and a 200000 loan is disbursed from it
- **THEN** its `balancePaisa` is 770000

#### Scenario: Repaid loan keeps the fund unchanged
- **WHEN** a 200000 loan from Cash is fully repaid by loan deductions on close and becomes REPAID
- **THEN** Cash's `balancePaisa` is the same as before the close

#### Scenario: Cash repayment and cancellation return money
- **WHEN** Cash is at 770000 after a 200000 loan, 50000 of it is repaid in cash into Cash, and another 100000 loan from Cash is cancelled
- **THEN** Cash's `balancePaisa` is 820000

#### Scenario: Write-off moves no cash
- **WHEN** a loan from Bank with 300000 outstanding is written off
- **THEN** Bank's `balancePaisa` is unchanged

#### Scenario: Deactivate with money in it
- **WHEN** a Super Admin deactivates an account whose balance is 1370000 paisa
- **THEN** the response is `409 FUND_NOT_EMPTY`

#### Scenario: Deactivate at zero
- **WHEN** the account balance is 0 and it is deactivated
- **THEN** the response is `200` with `isActive: false`, and a `fund_account.updated` audit row exists

### Requirement: Default categories seeded
Every property SHALL have these categories, each with English and Bangla names: Income — House rent (`RENT`, system), Arrear rent (`ARREAR`, system), Rooftop / tower lease (`ROOFTOP`), Parking / garage rent (`PARKING`), Other income (`OTHER_INC`), Adjustment (`ADJUSTMENT_INC`, system); Expense — Electricity (`ELEC`), Gas (`GAS`), Water (`WATER`), Repairs (`REPAIR`), Cleaning & maintenance (`CLEANING`), Guard / salary (`SALARY`), Lift maintenance (`LIFT`), Generator & fuel (`GENERATOR`), Internet & cable TV (`INTERNET`), Holding tax (`HOLDING_TAX`), Bank & mobile banking charges (`BANK_CHARGE`), Owner special grant (`OWNER_GRANT`, system), Loan written off (`LOAN_WRITTEN_OFF`, system), Other (`OTHER_EXP`), Adjustment (`ADJUSTMENT_EXP`, system). The seed creates them for new properties and a data migration backfills existing ones; both are idempotent and never change a category that already exists. With `SEED_DEMO=true` the seed also adds starter fund accounts (Cash in hand, Bank account, bKash) and units (Flat 1A–3A, Shop G1 with PRD §2.2 rents, no tenant names) when absent. (EXP-02, §2.2; Advances & Loans PRD F10)

#### Scenario: Seed twice
- **WHEN** the seed runs twice on the same database
- **THEN** each category code exists exactly once for the property

#### Scenario: Existing property backfilled
- **WHEN** the migration runs on a database whose property has no categories and one renamed, deactivated `ELEC`
- **THEN** all 21 codes exist and `ELEC` keeps its custom name and inactive state
