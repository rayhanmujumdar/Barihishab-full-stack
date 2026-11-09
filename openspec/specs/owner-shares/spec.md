# owner-shares Specification

## Purpose

Stores who owns how much of the house as versioned share sets in whole units, effective from the 1st of a month with a required reason, so share changes never alter closed months and every change stays visible in history. (Owners PRD F5, F6; OWN-03, OWN-04; Rules 1–6)

## Requirements

### Requirement: Share set model
A share set SHALL hold, for one property, an effective month (the 1st of a month), a reason (1–300 chars), who saved it and when, and one row per included owner with whole units ≥ 0. The set in force for month M is the active set with the latest effective month ≤ M. Share % for an owner = units ÷ Σ units of that set; money is always split from units, never from the rounded %. (§3 Share set, Rules 1–3)

#### Scenario: Set in force
- **WHEN** active sets exist for 2026-01 (50/25/15/10) and 2026-06 (40/25/15/10/10)
- **THEN** the set in force for 2026-05 is the 2026-01 set and for 2026-08 is the 2026-06 set

### Requirement: Save a share set
`POST /api/v1/owners/shares` (permission `share.manage`) SHALL accept `{ effectiveMonth: "YYYY-MM", reason, items: [{ ownerId, units }] }` and save all owners' units as one set in one DB transaction, idempotent via `Idempotency-Key`. Validation:
- every `ownerId` MUST be an owner of this property and appear at most once (`422`);
- every `units` MUST be an integer 0–1,000,000 (`422`);
- Σ units MUST be > 0, else `422` "Total share units must be above zero.";
- `reason` MUST be non-blank, else `422` "A reason is required for every share change.";
- `effectiveMonth` MUST NOT be a CLOSED period and MUST NOT be on or before the latest CLOSED period, else `409 PERIOD_CLOSED` with "That month is closed. Pick an open month or a later one.";
- `effectiveMonth` MUST be an existing OPEN period or the month right after the latest existing period, else `422`.
Owners omitted from `items` hold 0 units in the new set. Response `201 { shareSet }`; audit `share_set.saved` with before (previous set in force for that month) → after and the reason. (F6, Rules 1, 3, 4; §10.2 `POST /owners/shares`)

#### Scenario: Gift of units
- **WHEN** a Super Admin saves `effectiveMonth: "2026-06"`, reason "Gifted 10 units to Sabrina (deed 20 May 2026)", Nasrin 40, Rayhan 25, Tanvir 15, Farzana 10, Sabrina 10, and 2026-06 is OPEN
- **THEN** the response is `201`, the set totals 100 units, and the set in force for 2026-05 still shows Nasrin 50

#### Scenario: Missing reason
- **WHEN** `reason` is `"  "`
- **THEN** the response is `422 VALIDATION_FAILED` with field `reason`

#### Scenario: All zero
- **WHEN** every item has `units: 0`
- **THEN** the response is `422` with field `items` "Total share units must be above zero."

#### Scenario: Closed effective month
- **WHEN** 2026-09 is CLOSED and `effectiveMonth` is "2026-09"
- **THEN** the response is `409 PERIOD_CLOSED` and no set is saved

#### Scenario: Next month allowed
- **WHEN** the latest period is 2026-10 (OPEN) and `effectiveMonth` is "2026-11"
- **THEN** the set is saved

#### Scenario: Too far ahead
- **WHEN** the latest period is 2026-10 and `effectiveMonth` is "2027-01"
- **THEN** the response is `422 VALIDATION_FAILED` with field `effectiveMonth`

#### Scenario: Owner cannot change shares
- **WHEN** an Owner posts a share set
- **THEN** the response is `403 FORBIDDEN`

### Requirement: Same-month replacement
Only one active share set SHALL start in a given month. Saving another set for a month that already has an active set MUST mark the earlier one replaced (kept, with its own reason, in history) and make the new one active, in the same transaction. Concurrent saves for the same month MUST leave exactly one active set. (Rule 6)

#### Scenario: Replace a same-month set
- **WHEN** a set for 2026-11 exists and another set for 2026-11 is saved
- **THEN** the timeline lists both, the first marked `replaced`, and the set in force for 2026-11 is the second

### Requirement: Share timeline
`GET /api/v1/owners/shares` (permission `owner.view`) SHALL return every share set of the property, newest effective month first (replaced sets included and flagged), each with effective month, reason, saved-by name, saved-at, and per-owner units and % (owners with 0 units included only when they had units in the previous active set). (F5)

#### Scenario: Owner reads the timeline
- **WHEN** an Owner requests the timeline after the 2026-01 and 2026-06 sets
- **THEN** two sets are returned, 2026-06 first, each with reason and saved-by

### Requirement: Owner share history
The owner detail SHALL include that owner's share versions: one row per active set where the owner's units differ from the previous active set (including the first set that gave them units and any set that took them to 0), newest first, each with effective month, units, %, reason and saved-by name. (F5)

#### Scenario: Nasrin's history
- **WHEN** Nasrin had 50 units from 2026-01 and 40 from 2026-06, and a 2026-08 set left her at 40
- **THEN** her history has two rows: 2026-06 · 40 units, then 2026-01 · 50 units

### Requirement: Closed months keep their shares
Saving a share set SHALL NOT change the set in force for any CLOSED month. (Rule 5, Acceptance "closed months' entitlements don't change")

#### Scenario: Closed month unaffected
- **WHEN** 2026-08 is CLOSED and a set effective 2026-10 is saved
- **THEN** the set in force for 2026-08 is unchanged
