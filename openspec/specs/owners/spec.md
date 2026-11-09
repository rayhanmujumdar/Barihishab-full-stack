# owners Specification

## Purpose

Keeps the list of people (or estates) who hold part of the house, whether or not they have a login, and gives every member a transparent list and detail view of each owner's share, balance and loan. (Owners PRD F1, F2, F7, F8, F9, F17; OWN-02)

## Requirements

### Requirement: Owner records
The system SHALL store owners per property with: optional linked user (one user MAY be linked to at most one owner per property), display name (1–80 chars), initials (1–3 chars, defaulted from the display name), display order (integer) and optional note (≤ 200 chars). An owner without a linked user is a **name-only** owner. Owners MUST NOT be deletable through any API; there is no DELETE endpoint and the database MUST refuse deletes. (Owners PRD §3 Owner, F7, F8, Rules 18–19, G3)

#### Scenario: Name-only owner
- **WHEN** a Super Admin creates an owner `{ displayName: "Estate of Karim Ahmed" }` with no user
- **THEN** the owner is stored with `userId: null` and initials `"EA"`

#### Scenario: One login, one owner
- **WHEN** a Super Admin links a user who is already linked to another owner
- **THEN** the response is `409 USER_ALREADY_OWNER` and nothing changes

#### Scenario: No delete
- **WHEN** a client sends `DELETE /api/v1/owners/:id`
- **THEN** the response is `405` and the owner remains

### Requirement: Derived owner status
Each owner's status SHALL be derived, never stored: **current** when the share set in force for the current Asia/Dhaka month gives them more than 0 units; **former** when they had more than 0 units in an earlier share set but 0 (or absent) in the one in force; **new** when no share set has ever given them units. The month they left (former) is the effective month of the first share set that took them to 0. (F9, G2, Rule 18)

#### Scenario: Former after giving away all units
- **WHEN** Sabrina had 10 units from 2026-06 and a set effective 2026-09 gives her 0, and today is in 2026-10
- **THEN** Sabrina's status is `former` with `leftMonth: "2026-09"`

#### Scenario: Future set does not change status today
- **WHEN** today is in 2026-10 and a set effective 2026-11 sets Tanvir to 0
- **THEN** Tanvir is still `current`

### Requirement: Owner list endpoint
`GET /api/v1/owners` (permission `owner.view`) SHALL return `{ houseName, totalUnits, owners[], formerOwners[] }` where `owners` holds current and new owners and `formerOwners` holds former owners, each sorted by display order then display name. Every owner item MUST include id, display name, initials, responsibility (linked user's house responsibility, else null), note, units and share % in force today (% = units ÷ total × 100, sent with full precision; clients display 1 decimal), status, tags (`superAdmin`, `invitePending` when the linked user is INVITED, `noLogin` when name-only), `isViewer` (linked to the requester), balance in paisa, balance label (`OWED` when > 0, `ADVANCE` when < 0, `SETTLED` when 0), loan outstanding in paisa, and for former owners `leftMonth`. `totalUnits` is the sum of units in force today. (F1, F9, Rules 2, 9, 22; §10.2 `GET /owners`)

#### Scenario: Owner sees everyone
- **WHEN** an Owner requests the list for the PRD §2.2 sample (40/25/15/10/10)
- **THEN** all five owners are returned with `totalUnits: 100`, Nasrin `sharePercent: 40`, and only the requester's own item has `isViewer: true`

#### Scenario: Balance labels
- **WHEN** Tanvir's ledger sums to 805585 paisa, Nasrin's to −500000 and Rayhan's to 0
- **THEN** their labels are `OWED`, `ADVANCE` and `SETTLED` respectively

#### Scenario: Former owners are separate
- **WHEN** one owner is former
- **THEN** that owner appears only in `formerOwners`, with `leftMonth` and their last balance

#### Scenario: Unauthenticated
- **WHEN** an anonymous request is made
- **THEN** the response is `401 UNAUTHENTICATED`

### Requirement: Owner detail endpoint
`GET /api/v1/owners/:id?year=YYYY` (permission `owner.view`) SHALL return the list item fields plus email and phone of the linked user (null for name-only), `entitlementPaisa` = Σ ENTITLEMENT entries whose period is in `year`, `paidOutPaisa` = Σ |amount| of non-voided PAYOUT and ADVANCE entries dated in `year` (voided originals and their reversals excluded), the oldest due month (see owner-ledger), and the owner's share history. `year` defaults to the current Asia/Dhaka year and MUST be between 2000 and 2100. An unknown id, an id of another property, or a malformed id returns `404 NOT_FOUND`. (F2, G4, G5)

#### Scenario: Paid out excludes voids
- **WHEN** in 2026 an owner has a 3000000 paisa payout, a 500000 paisa advance, and a 200000 paisa payout that was voided
- **THEN** `paidOutPaisa` for `year=2026` is 3500000

#### Scenario: Balance equals statement closing
- **WHEN** the detail and `GET /owners/:id/statement?to=latest` are requested together
- **THEN** `balancePaisa` equals the statement's `closingPaisa`

### Requirement: Add owner
`POST /api/v1/owners` (permission `owner.manage`) SHALL create an owner from `{ userId? , displayName?, initials?, sortOrder? }`. With `userId`, the user MUST exist and not already be an owner; `displayName` defaults to the user's full name. Without `userId`, `displayName` is required. `sortOrder` defaults to one more than the current maximum. The new owner has 0 units (status `new`) and counts in no month until a share set gives them units. Response `201 { owner }`; audit `owner.created`. (F7, G1)

#### Scenario: Link a user
- **WHEN** a Super Admin posts `{ userId }` for an ACTIVE user named "Sabrina Ahmed" who is not an owner
- **THEN** the response is `201` with `displayName: "Sabrina Ahmed"`, `units: 0`, `status: "new"`

#### Scenario: Owner cannot add
- **WHEN** an Owner posts to `/owners`
- **THEN** the response is `403 FORBIDDEN`

#### Scenario: Name required without user
- **WHEN** the body is `{}`
- **THEN** the response is `422 VALIDATION_FAILED` with a `displayName` field error

### Requirement: Edit owner
`PATCH /api/v1/owners/:id` (permission `owner.manage`) SHALL update any of display name, initials, display order, note, and `userId` (link a user who is not yet an owner, or `null` to unlink). Name changes MUST show everywhere including past statements (statements read the current name). Unchanged bodies return `200` without an audit row; changes write `owner.updated` with changed-field before/after. (F8, Flow 6.6)

#### Scenario: Rename keeps history in audit
- **WHEN** a Super Admin renames "Karim Ahmed" to "Estate of Karim Ahmed" and unlinks the login
- **THEN** the owner shows the new name, `userId: null`, tag `noLogin`, and an `owner.updated` audit row holds the old and new name

### Requirement: Display order
Owners SHALL be listed in ascending display order, then display name; the same order MUST be used to break ties wherever owners are ranked (e.g. rounding remainders in Distribution). (G10, Rule 7)

#### Scenario: Reorder
- **WHEN** a Super Admin sets Tanvir's `sortOrder` to 0 and everyone else is ≥ 1
- **THEN** Tanvir is first in `GET /owners`

### Requirement: Owner writes are audited
Every owner create and update SHALL write its audit row (`owner.created`, `owner.updated`) in the same DB transaction as the change; a failure of either MUST roll back both. (Owners PRD §11 General, AUD-01)

#### Scenario: Atomic
- **WHEN** the audit insert fails while creating an owner
- **THEN** no owner row exists
