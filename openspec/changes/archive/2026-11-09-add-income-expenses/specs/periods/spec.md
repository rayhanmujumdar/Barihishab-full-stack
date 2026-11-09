## Purpose

Defines the monthly accounting period every income and expense belongs to, keeps the current month open automatically, and guarantees that nothing recorded in a Closed month can change. (Main PRD §5.1, D8; Income & Expenses PRD §3.2–3.3, PER-01, LCK-01)

## ADDED Requirements

### Requirement: One period per month per property
The system SHALL keep at most one period per property per calendar month, identified as `YYYY-MM`, with status `OPEN` or `CLOSED`. Several months MAY be Open at once.

#### Scenario: Duplicate month rejected
- **WHEN** a second period for the same property and month `2026-10` is inserted
- **THEN** the database rejects it

### Requirement: Current month opens on demand
The system SHALL ensure the current Asia/Dhaka calendar month exists as an `OPEN` period whenever periods are listed, the Income & Expenses screen loads, or an entry is created, without changing the status of an existing period. (PER-01)

#### Scenario: First visit of a new month
- **WHEN** no period exists for `2026-11` and the clock in Asia/Dhaka reads 2026-11-01 00:05
- **THEN** listing periods creates `2026-11` with status `OPEN`

#### Scenario: Existing Closed month untouched
- **WHEN** the current month already exists with status `CLOSED`
- **THEN** listing periods leaves it `CLOSED`

#### Scenario: Concurrent opening
- **WHEN** two requests open the current month at the same time
- **THEN** exactly one period row exists afterwards and neither request fails

### Requirement: Period list endpoint
`GET /api/v1/periods` (permission `transaction.view`) SHALL return `200 { items: [{ id, month: "YYYY-MM", status }], latestOpen }` newest first, where `latestOpen` is the newest `OPEN` month or `null`.

#### Scenario: Owner lists periods
- **WHEN** an Owner calls `GET /api/v1/periods` with `2026-09` Closed and `2026-10`, `2026-11` Open
- **THEN** the items are `2026-11`, `2026-10`, `2026-09` in that order and `latestOpen` is `2026-11`

#### Scenario: Anonymous
- **WHEN** the endpoint is called without a session
- **THEN** the response is `401 UNAUTHENTICATED`

### Requirement: Closed-period write guard
Creating, correcting or voiding an entry in a `CLOSED` period, and moving an entry out of or into a `CLOSED` period, MUST fail with `409 PERIOD_CLOSED` at the API. The database MUST independently reject any insert or update of an income/expense row whose old or new period is `CLOSED`, and MUST reject every delete of income/expense and attachment rows. During a write the period row MUST be share-locked so a concurrent Close cannot interleave. (LCK-01, §9.3, §13 Concurrency)

#### Scenario: API write to a Closed month
- **WHEN** a Super Admin creates an expense with `period` `2026-09` and September is Closed
- **THEN** the response is `409 PERIOD_CLOSED` and no row is written (IE-04)

#### Scenario: Direct SQL bypass
- **WHEN** `UPDATE house_transactions SET amount_paisa = 1` is run directly on a row in a Closed period
- **THEN** the database raises `PERIOD_CLOSED`

#### Scenario: Delete blocked
- **WHEN** `DELETE FROM house_transactions` is run on any row
- **THEN** the database rejects it
