## MODIFIED Requirements

### Requirement: Entry origin
Every owner ledger entry SHALL carry an origin: `CLOSE` for ENTITLEMENT and LOAN_DEDUCTION entries posted by a month close (existing ones backfilled), `PAYOUT_SPLIT` for the ADVANCE created from a payout's excess, `REQUEST` for the ADVANCE created by disbursing a money request, and `DIRECT` for everything else (including manual loan deductions and all reversals). Entries returned by the API SHALL expose `origin`. A month reopen MUST continue to reverse only `CLOSE` entries. (Advances & Loans PRD F6, F8, G13; Requests PRD F7)

#### Scenario: Excess advance
- **WHEN** a payout's excess is split as an advance
- **THEN** the ADVANCE entry has `origin: "PAYOUT_SPLIT"` and the PAYOUT `origin: "DIRECT"`

#### Scenario: Close-posted entries
- **WHEN** a month is closed
- **THEN** its ENTITLEMENT and LOAN_DEDUCTION entries have `origin: "CLOSE"`

#### Scenario: Advance from a request survives a reopen
- **WHEN** an advance disbursed from a request is posted in October and October is closed and reopened
- **THEN** the ADVANCE entry has `origin: "REQUEST"` and is not voided by the reopen

## ADDED Requirements

### Requirement: Request link on ledger entries
An owner ledger entry SHALL be able to reference the money request that created it, with at most one entry per request. Statement and advance list rows SHALL expose `request: { id, number } | null`. Voiding a request-created ADVANCE MUST work like any advance void and leave the request DISBURSED. (Requests PRD F7, Rule 14; main PRD §9.3 `request_id`)

#### Scenario: Statement shows the request
- **WHEN** Tanvir's statement is loaded after R-2026-015 was disbursed as an advance
- **THEN** the ADVANCE row has `request: { number: "R-2026-015" }`

#### Scenario: One entry per request
- **WHEN** a second ledger entry is inserted with the same request id
- **THEN** the database raises a unique violation
