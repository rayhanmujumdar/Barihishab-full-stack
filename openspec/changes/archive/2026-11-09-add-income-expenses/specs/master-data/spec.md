## Purpose

Keeps the units, fund accounts and income/expense categories that every entry refers to, so entries stay consistent, bilingual and traceable even after master data changes. (Income & Expenses PRD §2.2, §3.6–3.7, §6.6, MST-01..03, EXP-02, FND-01)

## ADDED Requirements

### Requirement: Units
The system SHALL provide `GET /api/v1/units` (permission `transaction.view`), `POST /api/v1/units` and `PATCH /api/v1/units/:id` (permission `unit.manage`). A unit has a name (1–60 chars, unique per property), optional tenant name (≤ 100), monthly rent in paisa (≥ 0), optional default fund account (an active account of the same property), sort order and active flag. Units MUST NOT be deletable; deactivation hides them from Generate rent and the entry form while history keeps showing their name. (MST-01, G2, G12)

#### Scenario: Create a unit
- **WHEN** a Super Admin posts `{ name: "Flat 1A", tenantName: "Kamal Uddin", rentPaisa: 1800000, defaultFundAccountId: <cash> }`
- **THEN** the response is `201` with the unit, and a `unit.created` audit row exists

#### Scenario: Duplicate name
- **WHEN** a second unit named `Flat 1A` is created
- **THEN** the response is `409 NAME_TAKEN`

#### Scenario: Owner cannot write
- **WHEN** an Owner posts to `/api/v1/units`
- **THEN** the response is `403 FORBIDDEN`

#### Scenario: Deactivated unit keeps history
- **WHEN** Flat 1A has rent entries and is deactivated
- **THEN** the entries still show `Flat 1A`, and `GET /api/v1/units?active=true` no longer returns it

### Requirement: Fund accounts with live balance
The system SHALL provide `GET /api/v1/fund-accounts` (permission `transaction.view`), `POST` and `PATCH /api/v1/fund-accounts/:id` (permission `fund.manage`). A fund account has a name (1–60 chars), type `CASH` / `BANK` / `WALLET`, opening balance in paisa (may be 0 or negative), opening date and active flag. Every account returned MUST include `balancePaisa` = opening balance + Σ non-voided income − Σ non-voided expense booked to it (including From-Reserve expenses). Deactivation MUST be refused with `409 FUND_NOT_EMPTY` while the balance is not 0. Type and opening balance MAY be edited; accounts MUST NOT be deletable. (MST-02, FND-01, §11)

#### Scenario: Balance reflects entries
- **WHEN** Cash opened at 200000 paisa, receives 1800000 paisa income and pays 630000 paisa expense, and a 50000 paisa expense on it is voided
- **THEN** its `balancePaisa` is 1370000

#### Scenario: Deactivate with money in it
- **WHEN** a Super Admin deactivates an account whose balance is 1370000 paisa
- **THEN** the response is `409 FUND_NOT_EMPTY`

#### Scenario: Deactivate at zero
- **WHEN** the account balance is 0 and it is deactivated
- **THEN** the response is `200` with `isActive: false`, and a `fund_account.updated` audit row exists

### Requirement: Categories with system locks
The system SHALL provide `GET /api/v1/categories?kind=INCOME|EXPENSE` (permission `transaction.view`), `POST` and `PATCH /api/v1/categories/:id` (permission `category.manage`). A category has kind, code (unique per property, generated for admin-made categories), English and Bangla names (1–60 chars each), system flag, active flag and sort order. System categories (`RENT`, `ARREAR`, `OWNER_GRANT`, `ADJUSTMENT_INC`, `ADJUSTMENT_EXP`) MUST NOT be renamed, deactivated or have their kind changed — any such attempt returns `409 CATEGORY_LOCKED`. Admin-made categories MAY be renamed in both languages and deactivated; kind is fixed after creation. Categories MUST NOT be deletable; deactivated ones stay on old entries but leave the form. (MST-03, EXP-02, §3.7)

#### Scenario: Deactivate RENT
- **WHEN** a Super Admin patches `RENT` with `{ isActive: false }`
- **THEN** the response is `409 CATEGORY_LOCKED` (IE-16)

#### Scenario: Rename an admin category
- **WHEN** a Super Admin renames `Other` to `{ nameEn: "Misc", nameBn: "বিবিধ" }`
- **THEN** the response is `200` and a `category.updated` audit row records before and after names

### Requirement: Default categories seeded
Every property SHALL have these categories, each with English and Bangla names: Income — House rent (`RENT`, system), Arrear rent (`ARREAR`, system), Rooftop / tower lease (`ROOFTOP`), Parking / garage rent (`PARKING`), Other income (`OTHER_INC`), Adjustment (`ADJUSTMENT_INC`, system); Expense — Electricity (`ELEC`), Gas (`GAS`), Water (`WATER`), Repairs (`REPAIR`), Cleaning & maintenance (`CLEANING`), Guard / salary (`SALARY`), Lift maintenance (`LIFT`), Generator & fuel (`GENERATOR`), Internet & cable TV (`INTERNET`), Holding tax (`HOLDING_TAX`), Bank & mobile banking charges (`BANK_CHARGE`), Owner special grant (`OWNER_GRANT`, system), Other (`OTHER_EXP`), Adjustment (`ADJUSTMENT_EXP`, system). The seed creates them for new properties and a data migration backfills existing ones; both are idempotent and never change a category that already exists. With `SEED_DEMO=true` the seed also adds starter fund accounts (Cash in hand, Bank account, bKash) and units (Flat 1A–3A, Shop G1 with PRD §2.2 rents, no tenant names) when absent. (EXP-02, §2.2)

#### Scenario: Seed twice
- **WHEN** the seed runs twice on the same database
- **THEN** each category code exists exactly once for the property

#### Scenario: Existing property backfilled
- **WHEN** the migration runs on a database whose property has no categories and one renamed, deactivated `ELEC`
- **THEN** all 20 codes exist and `ELEC` keeps its custom name and inactive state

### Requirement: Master data changes are audited
Every create or update of a unit, fund account or category SHALL write `unit.created|updated`, `fund_account.created|updated` or `category.created|updated` with changed fields before/after, in the same DB transaction. (AUD-01, §12.1)

#### Scenario: Unit rent change
- **WHEN** Flat 2A's rent changes from 2000000 to 2100000 paisa
- **THEN** a `unit.updated` row has `before: { rentPaisa: 2000000 }` and `after: { rentPaisa: 2100000 }`
