# advances Specification

## Purpose

Shows every advance paid to owners with whether it is still outstanding or when it was recovered, each owner's advance and loan standing against the advance limit, and lets the Super Admin set the advance-limit rule. (Advances & Loans PRD F1, F11–F14, §7.5, §7.6; main PRD SET-02)

## Requirements

### Requirement: Advance limit setting
The property SHALL store one advance-limit multiplier in percent, one of 50, 100, 150, 200 (0.5×, 1×, 1.5×, 2×; default 100). `GET /api/v1/settings/advance-limit` (permission `settings.manage`) SHALL return it; `PUT` (permission `settings.manage`) with `{ multiplierPct }` SHALL save it and write audit `settings.advance_limit_updated` with before/after. Any other value returns `422`. (F14, SET-02)

#### Scenario: Set 1.5×
- **WHEN** a Super Admin puts `{ multiplierPct: 150 }`
- **THEN** the response is `200` with `multiplierPct: 150` and a `settings.advance_limit_updated` audit row exists

#### Scenario: Invalid multiplier
- **WHEN** `multiplierPct` is 120
- **THEN** the response is `422 VALIDATION_FAILED` and the setting is unchanged

#### Scenario: Owner refused
- **WHEN** an Owner calls `PUT /api/v1/settings/advance-limit`
- **THEN** the response is `403 FORBIDDEN`

### Requirement: Advance limit per owner
An owner's advance limit SHALL be ⌊multiplierPct × average ÷ 100⌋ where average = the mean of their non-voided ENTITLEMENT totals in the last 3 CLOSED months (fewer when fewer exist; a closed month without entitlement counts as 0). With no closed months, or a limit that comes out at 0 (no entitlement, or 0.5× of a sub-paisa average), there is no limit (`null`). Advance outstanding SHALL be max(0, −balance). Limit used SHALL be advance outstanding ÷ limit (with a new advance: (advance outstanding + amount) ÷ limit). (§7.5, F14)

#### Scenario: Nasrin's limit
- **WHEN** Nasrin's July, August and September entitlements are 2989440, 3477760 and 3481560 and the multiplier is 100
- **THEN** her limit is 3316253, and a 500000 advance from a 0 balance uses 15 % of it

#### Scenario: Reopened month counted once
- **WHEN** September was closed, reopened and closed again
- **THEN** only September's non-voided entitlement counts in the average

#### Scenario: No closed months
- **WHEN** the house has no CLOSED month
- **THEN** every owner's limit is `null`

### Requirement: Advance recovery status
Each non-voided ADVANCE SHALL have a status computed on read from the owner's ledger in posting order (voided entries and REVERSALs skipped): advances add to an owner's debt queue only the part that takes the balance below 0, other debits that take it below 0 are queued too, and credits clear the queue oldest first. An advance whose queued part is 0 or has been cleared is **RECOVERED** in the month of the entry that cleared it (its own month when it never took the balance below 0); otherwise it is **OUTSTANDING**. A voided advance is **VOID** with its reason. (§7.6, F11, G6)

#### Scenario: Recovered on close
- **WHEN** Nasrin (balance 0) gets a 500000 advance on 2026-10-12 and October's close posts her 3382760 entitlement
- **THEN** the advance is RECOVERED in "2026-10" and her balance is 2882760

#### Scenario: Oldest first
- **WHEN** an owner at balance 0 takes advances of 300000 in August and 200000 in September, and September's close credits 400000
- **THEN** the August advance is RECOVERED in "2026-09" and the September advance stays OUTSTANDING

#### Scenario: Voided advance
- **WHEN** an advance is voided with reason "Duplicate"
- **THEN** it is VOID with that reason and does not count in any total

### Requirement: Advance history
`GET /api/v1/advances` (permission `loan.view`) with optional `ownerId` and `year` (default the current year in Asia/Dhaka) SHALL return `{ advances, summary, limit }`: advances newest first (date, then creation), filtered by owner and by the year of their date, each with id, owner id and name, date, posting month, amount (positive), reason, origin (`DIRECT` / `PAYOUT_SPLIT`), isSelf, flagged, status, recovered month, void reason and the owner's current balance; `summary { advancesOutstandingPaisa, paidInYearPaisa, year, years }` where advances outstanding = Σ owners' advance outstanding (not filtered) and paid in year = Σ non-voided advances dated in `year` (not filtered by owner); `years` lists the years with advances; and `limit { multiplierPct }`. Invalid filters return `422`. (F1, F11, G5, G7)

#### Scenario: Year total excludes voids
- **WHEN** 2026 has advances of 500000 and 300000 and the 300000 one is voided
- **THEN** `paidInYearPaisa` for 2026 is 500000 and both rows are listed, the second with status VOID

#### Scenario: Owner can read
- **WHEN** an Owner reads `GET /api/v1/advances`
- **THEN** the response is `200` with every owner's advances

### Requirement: Standing by owner
`GET /api/v1/advances/by-owner` (permission `loan.view`) SHALL return one row per owner in display order with: loan outstanding and number of ACTIVE loans, balance, advance outstanding, average entitlement, advance limit, limit used % (null without a limit) and last advance date (non-voided). (F13, F14)

#### Scenario: Tanvir's standing
- **WHEN** Tanvir has L2 with 3500000 outstanding, a balance of −200000 and a limit of 1243595
- **THEN** his row shows loan outstanding 3500000 with 1 active loan, advance outstanding 200000 and limit used 16 %
