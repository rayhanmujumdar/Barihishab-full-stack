## Purpose

Keeps one append-only ledger per owner — opening, entitlement, payout, advance, loan deduction, adjustment and reversal entries in signed paisa — so every owner's balance is computed, explainable line by line like a bank statement, and corrected only by reversal or adjustment. (Owners PRD F3, F10–F14; PRD §5.4; PAY-01–PAY-04, ADV-01; Rules 8–17)

## ADDED Requirements

### Requirement: Ledger entries
Each owner ledger entry SHALL hold owner, posting period, type (`OPENING`, `ENTITLEMENT`, `PAYOUT`, `ADVANCE`, `LOAN_DEDUCTION`, `ADJUSTMENT`, `REVERSAL`), signed `amountPaisa` (+ increases what the house owes, − decreases it; never 0), entry date, optional fund account, method (`CASH`, `BANK`, `BKASH`, `NAGAD`), reference no., note/reason, reference month (adjustments), `reversesId` (reversals), `isSelf`, `flagged`, recorded-by and timestamps, and void fields (`voidedAt`, `voidedBy`, `voidReason`). PAYOUT and ADVANCE MUST be negative and carry a fund account; ENTITLEMENT MUST be positive; REVERSAL MUST be the exact negative of its original and carry the original's fund account. Entries MUST NOT be deleted (DB refuses) and MUST NOT be inserted or updated in a CLOSED period (DB refuses with `PERIOD_CLOSED`). Apart from voiding and the Opening rule below, entries MUST NOT be edited. (§5.4, Rule 10)

#### Scenario: Delete refused
- **WHEN** a raw `DELETE FROM owner_ledger_entries` runs
- **THEN** the database raises and the row remains

#### Scenario: Closed period refused
- **WHEN** a raw insert targets a CLOSED period
- **THEN** the database raises `PERIOD_CLOSED`

### Requirement: Computed owner balance
An owner's balance SHALL be Σ `amountPaisa` of all their entries — voided originals and their reversals included, which cancel each other — computed on every read and never stored. Positive = Owed, negative = Advance outstanding, zero = Settled. (Rules 8, 9, 11; §3 Owner balance)

#### Scenario: Void cancels out
- **WHEN** an owner has OPENING +1000000, PAYOUT −400000 (voided) and its REVERSAL +400000
- **THEN** the balance is 1000000

### Requirement: Oldest due month
For an owner with a positive balance, the system SHALL report the oldest due month: apply all debits (Σ |negative amounts|) against credits (positive entries) oldest first by posting month; the oldest-due month is the posting month of the first credit not fully covered. For balance ≤ 0 it is null. (F11 "Against: {oldest unpaid month}", PAY-01)

#### Scenario: Partly paid
- **WHEN** credits are 2026-08 +3000000 and 2026-09 +3000000 and debits total 4000000
- **THEN** the oldest due month is "2026-09"

### Requirement: Opening balance
`PUT /api/v1/owners/:id/opening` (permission `owner.manage`) SHALL set the owner's single OPENING entry from `{ amountPaisa (non-zero, |x| ≤ 1,000,000,000), note (≤ 200) }`, posted in the property's earliest period dated its first day: it creates the entry if absent or updates its amount/note if present. While any period is CLOSED the request MUST return `409 OPENING_LOCKED` ("Opening balances are locked once a month is closed — use a Balance adjustment."). Audit `ledger.opening_set` with before/after. (F10, G11)

#### Scenario: Set and edit opening
- **WHEN** no month is closed and a Super Admin puts `{ amountPaisa: 2989440, note: "Owed from the 2025 notebook" }` twice with 3000000 the second time
- **THEN** exactly one OPENING entry exists, with 3000000

#### Scenario: Locked after a close
- **WHEN** any period is CLOSED
- **THEN** the response is `409 OPENING_LOCKED`

### Requirement: Posting in the latest open month
Payouts, advances, adjustments and reversals SHALL be posted in the latest OPEN period. When no period is OPEN the request MUST return `409 NO_OPEN_PERIOD` ("Open a month first — payments are recorded in an open month."). (Rule 14)

#### Scenario: No open month
- **WHEN** every period is CLOSED and a payout is posted
- **THEN** the response is `409 NO_OPEN_PERIOD` and nothing is written

### Requirement: Pay an owner
`POST /api/v1/payouts` (permission `payout.create`, `Idempotency-Key` required) SHALL accept `{ ownerId, amountPaisa (1–1,000,000,000), date (ISO, not after tomorrow Asia/Dhaka), fundAccountId (active, this property), method, referenceNo?, note? (≤ 200), attachmentIds? (≤ 5), splitExcessAs? ("ADVANCE" | "LOAN"), excessReason? (≤ 300) }`. `referenceNo` (1–60 chars) MUST be present for BANK, BKASH and NAGAD ("Add the bKash TrxID, Nagad TrxID or cheque number."). Under a per-owner lock, with `owed = max(balance, 0)`:
- `amountPaisa ≤ owed` → one PAYOUT of −amount;
- `amountPaisa > owed` and no `splitExcessAs` → `409 EXCEEDS_BALANCE` with `details: { balancePaisa, payoutPaisa: owed, excessPaisa: amount − owed }` and nothing written;
- with `splitExcessAs: "ADVANCE"` → PAYOUT −owed (omitted when owed = 0) and ADVANCE −excess whose reason is `excessReason` or, if blank, the note or "Paid beyond balance";
- with `splitExcessAs: "LOAN"` → PAYOUT −owed (omitted when owed = 0) and a loan of the excess (see loans).
Response `201 { entries, loan, balancePaisa, warnings }`. Soft warnings (never block): `FUND_SHORT { fundAccountId, balancePaisa }` when the chosen account would go below 0, `HOUSE_FUND_SHORT { balancePaisa }` when the amount exceeds Σ balances of all active fund accounts. Attachments are linked to the PAYOUT (or the first entry). Audit `ledger.payout_created` (+ `ledger.advance_created` / `loan.created` for a split). (F11, G8, PAY-01–PAY-04, Rules 12, 13, 15)

#### Scenario: Pay full balance
- **WHEN** Farzana's balance is 870390 and a Super Admin pays 870390 by BKASH with reference "8FJ2K1"
- **THEN** the response is `201` with one PAYOUT −870390 and `balancePaisa: 0`

#### Scenario: Over the balance
- **WHEN** Tanvir's balance is 805585 and the body has `amountPaisa: 1300000` and no split
- **THEN** the response is `409 EXCEEDS_BALANCE` with `payoutPaisa: 805585`, `excessPaisa: 494415`

#### Scenario: Split as advance
- **WHEN** the same body is re-sent with `splitExcessAs: "ADVANCE"`
- **THEN** two entries are written, PAYOUT −805585 and ADVANCE −494415, and `balancePaisa` is −494415

#### Scenario: Nothing owed
- **WHEN** the balance is −500000 and a payout of 100000 is sent with `splitExcessAs: "ADVANCE"`
- **THEN** only an ADVANCE −100000 is written

#### Scenario: Reference required
- **WHEN** `method` is "BKASH" and `referenceNo` is missing
- **THEN** the response is `422` with field `referenceNo`

#### Scenario: Fund warning
- **WHEN** the chosen fund holds 500000 and the payout is 870390
- **THEN** the payout is saved and `warnings` contains `FUND_SHORT`

#### Scenario: Double click
- **WHEN** the same request is sent twice with the same `Idempotency-Key`
- **THEN** one PAYOUT exists and both responses are identical

#### Scenario: Owner refused
- **WHEN** an Owner posts a payout
- **THEN** the response is `403 FORBIDDEN`

### Requirement: Record an advance
`POST /api/v1/advances` (permission `advance.create`, `Idempotency-Key` required) SHALL accept `{ ownerId, amountPaisa, date, fundAccountId, method, referenceNo?, reason (1–300, required), attachmentIds? }` with the same date, fund, method and reference rules as payouts, and write one ADVANCE of −amount. `isSelf` MUST be true when the owner is linked to the acting user. `flagged` MUST be true, and `warnings` contain `ADVANCE_OVER_LIMIT { limitPaisa }`, when the amount exceeds the advance limit = the average of the owner's per-month ENTITLEMENT totals over the last 3 CLOSED periods (no limit, never flagged, when there are none). Audit `ledger.advance_created`. (F12, ADV-01, Rule 16)

#### Scenario: Reason required
- **WHEN** `reason` is blank
- **THEN** the response is `422` with field `reason` and nothing is written

#### Scenario: Over the limit is flagged
- **WHEN** the owner's last 3 closed months' entitlements are 3000000, 3000000, 3000000 and the advance is 3500000
- **THEN** the advance is saved with `flagged: true` and warning `ADVANCE_OVER_LIMIT { limitPaisa: 3000000 }`

#### Scenario: Self advance
- **WHEN** the Super Admin records an advance for the owner linked to their own user
- **THEN** the entry has `isSelf: true`

### Requirement: Void a payout or advance
`POST /api/v1/ledger/:id/void` (permission `ledger.void`) with `{ reason (1–300) }` SHALL, in one transaction, mark the original voided (`voidedAt`, `voidedBy`, `voidReason`) and post a REVERSAL of the opposite amount, same fund account and method, dated today, in the latest open period, with `reversesId` = original. Only PAYOUT and ADVANCE MAY be voided (`409 NOT_VOIDABLE` otherwise); an already voided entry returns `409 ALREADY_VOIDED`; a blank reason returns `422` "Please write a reason — everyone can see it."; unknown id `404`. Concurrent voids MUST produce exactly one reversal. The balance and fund account return to their values before the original. Audit `ledger.voided` with the reason. (F13, Rule 17)

#### Scenario: Void restores everything
- **WHEN** a 500000 PAYOUT from Cash is voided with reason "Recorded for the wrong owner"
- **THEN** a REVERSAL +500000 on Cash exists, the original shows `voided: true`, and both the owner balance and the Cash balance equal their values before the payout

#### Scenario: Twice
- **WHEN** the same entry is voided again
- **THEN** the response is `409 ALREADY_VOIDED`

#### Scenario: Entitlement cannot be voided here
- **WHEN** an ENTITLEMENT entry is voided
- **THEN** the response is `409 NOT_VOIDABLE`

### Requirement: Balance adjustment
`POST /api/v1/adjustments` (permission `ledger.adjust`, `Idempotency-Key` required) SHALL accept `{ ownerId, amountPaisa (non-zero, |x| ≤ 1,000,000,000), referenceMonth ("YYYY-MM", an existing period of the property not after the latest open period, else `422`), reason (1–300) }` and write one ADJUSTMENT with that signed amount in the latest open period, no fund account, and no effect on any fund balance. Audit `ledger.adjustment_created`. (F14, G7)

#### Scenario: Reduce for a wrong June payout
- **WHEN** a Super Admin posts `{ amountPaisa: -500000, referenceMonth: "2026-06", reason: "June payout recorded against wrong owner" }`
- **THEN** an ADJUSTMENT −500000 "for 2026-06" exists and every fund balance is unchanged

### Requirement: Statement
`GET /api/v1/owners/:id/statement?from=YYYY-MM&to=YYYY-MM|latest` (permission `owner.view`) SHALL return `{ owner: { id, displayName, units, sharePercent }, from, to, broughtForwardPaisa, rows, closingPaisa, totals }`. `from` defaults to January of the current Asia/Dhaka year, `to` to `latest`; `from` after `to` returns `422`. `broughtForwardPaisa` = Σ entries posted before `from`; `rows` = entries posted in `from`..`to` (all later entries when `latest`), ordered by posting month, entry date, then creation time; each row has id, date, month, type, amountPaisa, runningPaisa, note, referenceNo, method, fundAccountName, referenceMonth, reversesId, voided, voidReason, isSelf, flagged, recordedBy, recordedAt and attachments `[{ id, fileName, mime }]`. `closingPaisa` = broughtForward + Σ rows, and for `latest` MUST equal the owner balance. `totals` is Σ amount per entry type over the rows. (F3, G6, Rules 8–9; Acceptance "Brought forward + all rows = Closing")

#### Scenario: Worked example
- **WHEN** Nasrin's statement for `from=2026-08&to=latest` is requested with the PRD §10 entries
- **THEN** `broughtForwardPaisa` is 2989440, the last row's `runningPaisa` is −500000 and `closingPaisa` is −500000

#### Scenario: Empty range
- **WHEN** no entries are posted in the range
- **THEN** `rows` is empty and `closingPaisa` equals `broughtForwardPaisa`

#### Scenario: Voided rows stay
- **WHEN** a range contains a voided payout and its reversal
- **THEN** both rows are listed, the original with `voided: true`, and the running balance after the reversal equals the running balance before the payout

### Requirement: Ledger writes are audited
Every opening, payout, advance, void and adjustment SHALL write its audit row (`ledger.opening_set`, `ledger.payout_created`, `ledger.advance_created`, `ledger.voided`, `ledger.adjustment_created`) with actor, entity, before/after and reason in the same DB transaction as the change. (Owners PRD §11 General, AUD-01)

#### Scenario: Atomic void
- **WHEN** the audit insert fails during a void
- **THEN** the original is not voided and no reversal exists
