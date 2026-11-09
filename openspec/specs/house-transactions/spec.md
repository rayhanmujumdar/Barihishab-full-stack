# house-transactions Specification

## Purpose

Records every taka that enters or leaves the house against a month — income and expenses in one ledger of positive integer paisa — with correction, void, adjustment, rent generation, warnings, idempotency and a full audit trail, and produces the per-month Income, Expense and ReserveSpent totals other modules consume. (Income & Expenses PRD §3, §7, §8, §10, §11, §12.1)

## Requirements

### Requirement: Create an income or expense
`POST /api/v1/transactions` (permission `transaction.create`) SHALL create one entry from `{ period, kind, categoryId, amountPaisa, txnDate, fundAccountId, unitId?, vendor?, description?, fromReserve?, referencePeriod?, attachmentIds? }` and return `201 { transaction, warnings, periodTotals }`. The whole write — entry, linked attachments, audit row `transaction.created` (after = full row) — MUST be one DB transaction. Validation (`422 VALIDATION_FAILED` with `details.fields`):
- `period` exists for this property and is `OPEN`, else `409 PERIOD_CLOSED` (Closed) or `422` (missing);
- `kind` is `INCOME` or `EXPENSE`;
- `categoryId` is an active category of the same kind and property, and not `OWNER_GRANT` or `ADJUSTMENT_*` (EXP-05; adjustments use their own endpoint);
- `amountPaisa` is an integer, > 0 and ≤ 1,000,000,000;
- `txnDate` is a valid ISO date no later than tomorrow in Asia/Dhaka;
- `fundAccountId` is an active account of this property;
- `unitId` is an active unit, required when the category is `RENT` or `ARREAR`, and only allowed for income;
- `referencePeriod` is required for `ARREAR`, MUST be a `CLOSED` month before `period`, and is rejected for other categories; creating an `ARREAR` additionally requires `transaction.adjust`;
- `vendor` ≤ 100 chars, `description` ≤ 200 chars, `fromReserve` only with `EXPENSE`;
- `attachmentIds` ≤ 5 unlinked uploads by this property (see attachments capability).
A RENT entry with an empty description MUST get `"{unit name} · {tenant name}"` (or the unit name alone). (INC-01, INC-02, EXP-01, §8)

#### Scenario: Create rent income
- **WHEN** a Super Admin creates `RENT` for Flat 1A, 1800000 paisa, in Open `2026-10`
- **THEN** the response is `201`, `periodTotals.incomePaisa` grew by 1800000 and the description is `Flat 1A · Kamal Uddin` (IE-01)

#### Scenario: Zero amount
- **WHEN** `amountPaisa` is 0
- **THEN** the response is `422 VALIDATION_FAILED` with a field error on `amountPaisa` (IE-03)

#### Scenario: Rent without unit
- **WHEN** a `RENT` entry has no `unitId`
- **THEN** the response is `422` with a field error on `unitId`

#### Scenario: Arrear needs a Closed reference month
- **WHEN** an `ARREAR` for Flat 3A, 2200000 paisa, is created in Open `2026-11` with `referencePeriod` `2026-10` (Closed)
- **THEN** the response is `201` and it counts in November's income (IE-13)

#### Scenario: Arrear with an Open reference month
- **WHEN** `referencePeriod` is an Open month
- **THEN** the response is `422` with a field error on `referencePeriod`

#### Scenario: Owner grant not manual
- **WHEN** a Super Admin creates an expense with the `OWNER_GRANT` category
- **THEN** the response is `422` with a field error on `categoryId`

#### Scenario: Owner cannot create
- **WHEN** an Owner calls `POST /api/v1/transactions`
- **THEN** the response is `403 FORBIDDEN` (IE-15)

### Requirement: Idempotent creates
Every money-creating POST (`/transactions`, `/transactions/adjustments`, `/transactions/generate-rent`) MUST require an `Idempotency-Key` header (8–100 chars). A repeat with the same key and same body by the same property MUST return the original status and body without writing again; the same key with a different body MUST return `409 IDEMPOTENCY_CONFLICT`. Two concurrent requests with the same key MUST produce one write. A missing key MUST return `422 VALIDATION_FAILED`. Stored keys MAY be discarded after 24 hours. (DUP-01)

#### Scenario: Double-tap Save
- **WHEN** the same create request with key `k-123` is sent twice
- **THEN** exactly one entry exists and both responses are identical `201` bodies (IE-14)

#### Scenario: Key reuse with a different body
- **WHEN** key `k-123` is reused with a different amount
- **THEN** the response is `409 IDEMPOTENCY_CONFLICT`

### Requirement: Soft warnings
Creates, corrections and adjustments SHALL return `warnings: [{ code, ...details }]` without blocking the save:
- `RENT_ALREADY_RECORDED` — another non-voided `RENT` exists for the same unit and period (INC-03);
- `POSSIBLE_DUPLICATE` — another non-voided entry with the same kind, category, amount and date exists in the period (DUP-02);
- `FUND_NEGATIVE` with `balancePaisa` — the fund account balance is below 0 after the write (FND-01);
- `DATE_FAR_FROM_PERIOD` — `txnDate` is more than 45 days from the period month (before its 1st or after its last day). (G5)

#### Scenario: Second rent same unit
- **WHEN** a second `RENT` for Flat 1A is created in `2026-10`
- **THEN** it is saved (`201`) with warning `RENT_ALREADY_RECORDED` (IE-12)

#### Scenario: Fund goes negative
- **WHEN** Cash holds 200000 paisa and a 500000 paisa expense is paid from Cash
- **THEN** it is saved with warning `FUND_NEGATIVE` and `balancePaisa: -300000` (IE-17)

### Requirement: Period totals
For each period the system SHALL compute, over non-voided entries only: `incomePaisa` = Σ income; `expensePaisa` = Σ expense where `fromReserve` is false; `reserveSpentPaisa` = Σ expense where `fromReserve` is true; plus `incomeCount` and `expenseCount` (non-voided; From-Reserve expenses counted). Totals MUST be computed, never stored. (§11, §9.4)

#### Scenario: From-Reserve expense
- **WHEN** an 1800000 paisa water-pump expense is recorded with `fromReserve: true`
- **THEN** `expensePaisa` is unchanged and `reserveSpentPaisa` grows by 1800000 (IE-11)

#### Scenario: Seed October example
- **WHEN** October holds rent 8800000 + lease 1500000 income and 630000 + 360000 + 108000 + 300000 expense
- **THEN** `incomePaisa` is 10300000 and `expensePaisa` is 1398000

### Requirement: List and summary
`GET /api/v1/transactions/summary?period=YYYY-MM` (permission `transaction.view`) SHALL return `{ period, status, totals, categories: [{ id, kind, code, nameEn, nameBn, count, totalPaisa }] }` where `categories` lists only categories with at least one entry (voided included in `count`, excluded from `totalPaisa`). `GET /api/v1/transactions?period=&kind=&category=&cursor=&limit=` (permission `transaction.view`, limit default 50, max 200) SHALL return `{ items, nextCursor, totalPaisa }` sorted by `txnDate` desc then `createdAt` desc, where each item carries date, kind, category (both names, code), unit name, vendor, description, fund account name, amount, `fromReserve`, `isCorrected`, `voidedAt`, `voidReason` and `attachmentCount`, and `totalPaisa` is the sum of non-voided items matching the filter (From-Reserve included when filtering by category). Unknown `period` returns empty results with status `null`. (LST-01..04)

#### Scenario: Voided rows listed but not totalled
- **WHEN** October expenses are 630000 and a voided 50000 paisa entry
- **THEN** the list returns both rows, the voided one with `voidedAt` and `voidReason`, and `totalPaisa` is 630000

#### Scenario: Chips only for used categories
- **WHEN** October has entries only in Electricity and Water
- **THEN** the summary's expense `categories` are exactly Electricity and Water

### Requirement: Entry detail with history
`GET /api/v1/transactions/:id` (permission `transaction.view`) SHALL return the entry with every field, the recorder's name, the period status, its non-removed attachments, and `history`: a "created" item from the entry itself followed by each `transaction.updated`, `transaction.voided`, `attachment.added` and `attachment.removed` audit row for it, oldest first, each with actor name, time, before/after and reason. An id outside this property MUST return `404 NOT_FOUND`. (DET-01, §6.3)

#### Scenario: Owner reads a corrected bill
- **WHEN** an Owner opens an Electricity entry corrected from 603000 to 630000 paisa
- **THEN** `history` holds the created item then an update with `before: { amountPaisa: 603000 }`, `after: { amountPaisa: 630000 }` and the reason

### Requirement: Correct an entry
`PATCH /api/v1/transactions/:id` (permission `transaction.update`) SHALL change any of `period`, `categoryId`, `unitId`, `amountPaisa`, `txnDate`, `fundAccountId`, `vendor`, `description`, `fromReserve`, `referencePeriod` with the same validation as create, plus a required `reason` (5–500 chars). Kind MUST NOT change. It MUST set `isCorrected`, record `updatedBy`, and write `transaction.updated` with only the changed fields before/after plus the reason, in one DB transaction. A patch with no actual change MUST return `422`. Correcting a voided entry MUST return `409 ALREADY_VOIDED`; an entry whose current or target period is Closed MUST return `409 PERIOD_CLOSED`. (COR-01, COR-02, VOD-02)

#### Scenario: Correct the amount
- **WHEN** an expense of 603000 paisa is patched to 630000 with reason `Typo — the DESCO bill reads ৳6,300`
- **THEN** the response is `200` with `isCorrected: true` and the audit row has before/after amounts (IE-05)

#### Scenario: Missing reason
- **WHEN** the patch has no `reason`
- **THEN** the response is `422` (IE-06)

#### Scenario: Move between Open months
- **WHEN** an entry moves from Open `2026-10` to Open `2026-11`
- **THEN** both months' totals reflect the move (IE-18)

#### Scenario: Move into a Closed month
- **WHEN** an entry moves from `2026-10` to Closed `2026-09`
- **THEN** the response is `409 PERIOD_CLOSED` (IE-19)

#### Scenario: Correct a voided entry
- **WHEN** a voided entry is patched
- **THEN** the response is `409 ALREADY_VOIDED` (IE-08)

### Requirement: Void an entry
`POST /api/v1/transactions/:id/void` (permission `transaction.void`) with `{ reason }` (5–500 chars) SHALL set `voidedAt`, `voidedBy` and `voidReason`, and write `transaction.voided` with the reason, in one DB transaction. The entry stays readable and listed but stops counting in totals and fund balances. Voiding again MUST return `409 ALREADY_VOIDED`; voiding in a Closed period MUST return `409 PERIOD_CLOSED`. No endpoint SHALL delete an entry. (VOD-01, VOD-02, §3.4)

#### Scenario: Void a duplicate
- **WHEN** an entry is voided with reason `Duplicate entry`
- **THEN** it is excluded from totals and still returned by the list with its reason (IE-07)

#### Scenario: Short reason
- **WHEN** the reason is `dup`
- **THEN** the response is `422`

### Requirement: Adjustments for Closed months
`POST /api/v1/transactions/adjustments` (permission `transaction.adjust`) SHALL create an income or expense in an Open `period` with category `ADJUSTMENT_INC` / `ADJUSTMENT_EXP` (chosen by kind), `source` `ADJUSTMENT`, a required `referencePeriod` that is a `CLOSED` month before `period`, and a required `reason` (5–500 chars). Body otherwise as create (no unit, no attachments required). It MUST write `transaction.adjustment_created` with the reference month and reason, and requires `Idempotency-Key`. (LCK-02)

#### Scenario: Older-month correction
- **WHEN** a Super Admin records a 120000 paisa expense adjustment in Open `2026-11` referencing Closed `2026-08` with a reason
- **THEN** the response is `201`, the entry counts in November's expense, and its detail shows reference month `2026-08`

#### Scenario: Owner forbidden
- **WHEN** an Owner posts an adjustment
- **THEN** the response is `403 FORBIDDEN`

### Requirement: Generate rent
`POST /api/v1/transactions/generate-rent/preview` (permission `transaction.create`) with `{ period }` SHALL return, without writing, `{ period, rows: [{ unitId, unit, tenant, amountPaisa, fundAccountId, selected: true }] }` for every active unit with no non-voided `RENT` in that Open period, amount = unit rent, fund = unit default fund (or `null`). `POST /api/v1/transactions/generate-rent` (permission `transaction.create`, `Idempotency-Key` required) with `{ period, txnDate, rows: [{ unitId, amountPaisa, fundAccountId }] }` (1–100 rows, unique units) SHALL, in one DB transaction, create a `RENT` entry with `source` `GENERATED_RENT` for each row whose unit still has no non-voided `RENT` in the period, skip the others, and write one `transaction.rent_generated` audit row (entity = the period) with the unit list and total. Response: `201 { created, transactions, skipped: [{ unitId, unit }], periodTotals }`. (INC-04, §5.3, §10.4)

#### Scenario: Preview skips paid units
- **WHEN** 6 units are active and Flat 3A already has October rent
- **THEN** the preview returns the 5 other units (IE-09)

#### Scenario: Save five rows
- **WHEN** the 5 previewed rows are saved
- **THEN** 5 `RENT` entries and exactly 1 `transaction.rent_generated` audit row are created, and a new preview returns no rows

#### Scenario: Race between preview and save
- **WHEN** Flat 1A receives rent after the preview and the batch including Flat 1A is saved
- **THEN** Flat 1A is listed in `skipped` and the other rows are saved (IE-10)

#### Scenario: Closed month
- **WHEN** preview or save targets a Closed period
- **THEN** the response is `409 PERIOD_CLOSED`

### Requirement: Vendor autocomplete
`GET /api/v1/transactions/vendors?q=` (permission `transaction.create`) SHALL return up to 10 distinct vendor names from this property's expenses, case-insensitively prefix-matching `q`, most used first. (EXP-03)

#### Scenario: Prefix match
- **WHEN** `DESCO` and `Dhaka WASA` exist and `q=d`
- **THEN** both are returned; with `q=dh` only `Dhaka WASA` is returned

### Requirement: Financial audit trail
Every create, correct, void, generate, adjustment and attachment change SHALL write its audit action (`transaction.created`, `transaction.updated`, `transaction.voided`, `transaction.rent_generated`, `transaction.adjustment_created`, `attachment.added`, `attachment.removed`) with actor, entity, before/after and reason, in the same DB transaction as the change; a failure of either MUST roll back both. (AUD-01, §12.1)

#### Scenario: Atomic with the write
- **WHEN** the audit insert fails during a void
- **THEN** the entry remains un-voided
