## MODIFIED Requirements

### Requirement: Record an advance
`POST /api/v1/advances` (permission `advance.create`, `Idempotency-Key` required) SHALL accept `{ ownerId, amountPaisa, date, fundAccountId, method, referenceNo?, reason (1–300, required), attachmentIds? }` with the same date, fund, method and reference rules as payouts, and write one ADVANCE of −amount with origin `DIRECT`. `isSelf` MUST be true when the owner is linked to the acting user. `flagged` MUST be true, and `warnings` contain `ADVANCE_OVER_LIMIT { limitPaisa }`, when the owner's advance outstanding before the advance (max(0, −balance)) plus the amount exceeds the owner's advance limit (the Settings multiplier × the average of their non-voided per-month ENTITLEMENT totals over the last 3 CLOSED periods; no limit, never flagged, when there is none). When the owner's balance before the advance is positive, `warnings` MUST contain `OWNER_OWED { balancePaisa }` ("{Name} is owed ৳X — pay that first; an advance is for money beyond what is owed."); the advance is still saved. Audit `ledger.advance_created`. (F12, G11, ADV-01, Rule 16; Advances & Loans PRD §7.5)

#### Scenario: Reason required
- **WHEN** `reason` is blank
- **THEN** the response is `422` with field `reason` and nothing is written

#### Scenario: Over the limit is flagged
- **WHEN** the owner's last 3 closed months' entitlements are 3000000, 3000000, 3000000, the multiplier is 100, the balance is 0 and the advance is 3500000
- **THEN** the advance is saved with `flagged: true` and warning `ADVANCE_OVER_LIMIT { limitPaisa: 3000000 }`

#### Scenario: Existing advance counts toward the limit
- **WHEN** the limit is 3000000, the owner's balance is −2000000 and a 1500000 advance is recorded
- **THEN** the advance is flagged with `ADVANCE_OVER_LIMIT`

#### Scenario: Owner is owed money
- **WHEN** an advance of 500000 is recorded for an owner whose balance is 805585
- **THEN** the advance is saved and `warnings` contains `OWNER_OWED { balancePaisa: 805585 }`

#### Scenario: Self advance
- **WHEN** the Super Admin records an advance for the owner linked to their own user
- **THEN** the entry has `isSelf: true`

## ADDED Requirements

### Requirement: Entry origin
Every owner ledger entry SHALL carry an origin: `CLOSE` for ENTITLEMENT and LOAN_DEDUCTION entries posted by a month close (existing ones backfilled), `PAYOUT_SPLIT` for the ADVANCE created from a payout's excess, and `DIRECT` for everything else (including manual loan deductions and all reversals). Entries returned by the API SHALL expose `origin`. (Advances & Loans PRD F6, F8, G13)

#### Scenario: Excess advance
- **WHEN** a payout's excess is split as an advance
- **THEN** the ADVANCE entry has `origin: "PAYOUT_SPLIT"` and the PAYOUT `origin: "DIRECT"`

#### Scenario: Close-posted entries
- **WHEN** a month is closed
- **THEN** its ENTITLEMENT and LOAN_DEDUCTION entries have `origin: "CLOSE"`
