# reserve Specification

## Purpose

Holds back money each month for big future costs by a rule set in Settings, lets the Super Admin override it for one open month with a reason, and tracks how much reserve the house still has. (Distribution PRD F9, G3, §7.1, §7.4; main PRD D14, SET-02)

## Requirements

### Requirement: Reserve rule setting
The property SHALL store one reserve rule: mode `OFF` (default), `PERCENT` with a percent in basis points (1–10000, e.g. 500 = 5 %), or `FIXED` with an amount in paisa (> 0), plus a starting reserve in paisa (≥ 0, default 0). `GET /api/v1/settings/reserve` (permission `settings.manage`) SHALL return the rule and the reserve balance; `PUT` (permission `settings.manage`) SHALL validate and save it and write audit `settings.reserve_updated` with before/after. (SET-02, F9)

#### Scenario: Set 5 %
- **WHEN** a Super Admin puts `{ mode: "PERCENT", percentBp: 500, startingPaisa: 0 }`
- **THEN** the response is `200` with the saved rule and a `settings.reserve_updated` audit row exists

#### Scenario: Invalid percent
- **WHEN** `percentBp` is 0 or 10001
- **THEN** the response is `422 VALIDATION_FAILED` and the rule is unchanged

#### Scenario: Owner refused
- **WHEN** an Owner calls `PUT /api/v1/settings/reserve`
- **THEN** the response is `403 FORBIDDEN`

### Requirement: Reserve for a month
A month's reserve SHALL be: 0 when Surplus ≤ 0; otherwise the month's override when set; otherwise by the rule — OFF → 0; PERCENT → Surplus × percent rounded half-up to whole taka (multiple of 100 paisa); FIXED → min(fixed amount, Surplus). An override MUST NOT exceed Surplus at calculation time (capped to Surplus). (§7.1, Rule 10)

#### Scenario: Percent rounding
- **WHEN** Surplus is 8902050 and the rule is 5 %
- **THEN** Reserve is 445100

#### Scenario: Fixed capped
- **WHEN** the rule is FIXED 2000000 and Surplus is 1500000
- **THEN** Reserve is 1500000 and Distributable 0 before previous deficit

#### Scenario: No surplus
- **WHEN** Surplus is −4578000 and the rule is 5 %
- **THEN** Reserve is 0

### Requirement: Reserve override for an open month
`PUT /api/v1/periods/{month}/reserve` (permission `reserve.override`) with `{ amountPaisa (≥ 0) , reason (1–300) }` SHALL set the override of an OPEN month, and with `{ amountPaisa: null }` SHALL reset it to the rule. A CLOSED month returns `409 PERIOD_CLOSED`; a set without reason returns `422`. Each change writes audit `period.reserve_overridden` (or `period.reserve_reset`) with before/after and reason. The staircase note SHALL read "Reserve set to ৳X for this month · {reason}". (G3, F9)

#### Scenario: Override October
- **WHEN** a Super Admin sets October's reserve to 1000000 with reason "Pump replacement next month"
- **THEN** October's Reserve is 1000000, Distributable 7902000, and the note carries the reason

#### Scenario: Reset
- **WHEN** the override is reset
- **THEN** October's Reserve is back to 445100

#### Scenario: Owner refused
- **WHEN** an Owner sets an override
- **THEN** the response is `403 FORBIDDEN`

### Requirement: Reserve balance
Reserve balance SHALL be starting reserve + Σ reserve of every CLOSED month (from snapshots) − Σ non-voided expenses paid from the Reserve (any month), computed on read and returned by the reserve settings endpoint and the distribution read model. The close preview SHALL warn when the month's reserve-paid expenses exceed the reserve balance plus this month's reserve. (§7.4, F9)

#### Scenario: Balance after two closes
- **WHEN** starting reserve is 0, September closed with reserve 491100, October closed with reserve 445100 and a 300000 roof expense was paid from the Reserve
- **THEN** the reserve balance is 636200
