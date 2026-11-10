# user-management Specification

## Purpose

Lets the Super Admin (family bookkeeper) add, find, edit, deactivate and force-logout household users and change their roles without a developer, while guaranteeing at least one active Super Admin always remains. (Auth PRD USR-01..05, §2 hard rules, §4 A6)

## Requirements

### Requirement: Create user
`POST /api/v1/users` (permission `user.create`) SHALL accept `username`, `email`, `firstName`, `lastName`, `surname`, `birthday`, `profession`, `phone`, `whatsapp`, `whatsappSameAsPhone`, `role`, `houseResponsibility`, `locale`, validate them per Auth PRD §4 Validation, and respond `201 { user }` after issuing the invite (see invite-onboarding). Duplicate username or email (case-insensitive) MUST respond `409 USERNAME_TAKEN` / `409 EMAIL_TAKEN`. Invalid fields MUST respond `422 VALIDATION_FAILED` with `details.fields`. (USR-01)

#### Scenario: Valid create
- **WHEN** a Super Admin posts username `karim_01`, email `karim@example.com`, phone `01712345678`, role OWNER
- **THEN** the response is `201` and the user is INVITED

#### Scenario: Duplicate email different case
- **WHEN** `KARIM@example.com` is posted while `karim@example.com` exists
- **THEN** the response is `409 EMAIL_TAKEN`

#### Scenario: Invalid username and phone
- **WHEN** username `Ka` and phone `12345` are posted
- **THEN** the response is `422 VALIDATION_FAILED` with `details.fields.username` and `details.fields.phone`

#### Scenario: WhatsApp same as phone
- **WHEN** `whatsappSameAsPhone = true` is posted with phone `+8801712345678`
- **THEN** the stored WhatsApp number equals the phone number

### Requirement: List and search users
`GET /api/v1/users` (permission `user.list`) SHALL support `q` (matches name, username, email, phone, case-insensitive), `role`, `status`, `cursor` and `limit` (default 50, max 100), and respond `200 { items, nextCursor }` where each item includes id, names, username, email, roles, house responsibility, status, last login and `inviteEmail`. For an INVITED user, `inviteEmail` SHALL describe that user's most recent `INVITE` outbox row as `{ status: "QUEUED" | "SENT" | "FAILED", queuedAt, sentAt, failureCode }`, where `failureCode` is the stable code from the outbox error (`SENDER_NOT_VERIFIED`, `INVALID_ADDRESS`, `PROVIDER_REJECTED`, `RECIPIENT_INACTIVE`, `RETRIES_EXHAUSTED`) or `null`; for any other user, or an INVITED user with no invite row, it SHALL be `null`. A `SENDING` row SHALL be reported as `QUEUED`. The raw provider error text, payload and tokens MUST NOT be returned. `GET /api/v1/users/:id` SHALL respond `200 { user, roles, lastLoginAt }` or `404 NOT_FOUND`. Password hashes and tokens MUST never be returned. (USR-02, USR-04)

#### Scenario: Search by phone fragment
- **WHEN** a Super Admin calls `GET /api/v1/users?q=0171`
- **THEN** only users whose phone contains `0171` are returned

#### Scenario: Filter by status
- **WHEN** `status=INVITED` is passed
- **THEN** only INVITED users are returned

#### Scenario: Pagination
- **WHEN** 60 users exist and `limit=50`
- **THEN** the first page has 50 items and a non-null `nextCursor`; the next page has 10 and `nextCursor = null`

#### Scenario: Latest invite delivery state
- **WHEN** an INVITED user has an older `SENT` invite and a newer `FAILED` invite whose error was an unverified sender
- **THEN** their item has `inviteEmail = { status: "FAILED", failureCode: "SENDER_NOT_VERIFIED", … }` and no provider message text

#### Scenario: Active user has no invite state
- **WHEN** the list includes an ACTIVE user who was invited earlier
- **THEN** that item has `inviteEmail = null`

### Requirement: Edit user
`PATCH /api/v1/users/:id` (permission `user.update`) SHALL update any profile field including username and email, with the same validation and uniqueness rules, write `user.updated` with before/after, and respond `200 { user }`.

#### Scenario: Admin changes a user's email
- **WHEN** a Super Admin updates an Owner's email to a free address
- **THEN** the response is `200` and an audit row records the old and new email

### Requirement: Change roles with last-Super-Admin guard
`PUT /api/v1/users/:id/roles` (permission `user.update`) with `{ roles: [...] }` SHALL replace the user's role set, revoke all of that user's refresh sessions, write `user.role.changed`, and respond `200`. It MUST respond `409 LAST_SUPER_ADMIN` if the change would leave zero ACTIVE Super Admins, and `409` with code `CANNOT_REMOVE_OWN_ADMIN` if a Super Admin removes their own `SUPER_ADMIN` role. Roles not enabled in v1 (`ACCOUNTANT`, `VIEWER`) MUST be rejected with `422`. (USR-04, §2 hard rules 1 and 5)

#### Scenario: Demote last Super Admin
- **WHEN** the only ACTIVE Super Admin is set to `["OWNER"]` by another path
- **THEN** the response is `409 LAST_SUPER_ADMIN` and roles are unchanged

#### Scenario: Remove own admin role
- **WHEN** Super Admin A (with another active Super Admin B present) sets their own roles to `["OWNER"]`
- **THEN** the response is `409 CANNOT_REMOVE_OWN_ADMIN`

#### Scenario: Role change revokes sessions
- **WHEN** Super Admin promotes Owner `karim` to SUPER_ADMIN
- **THEN** all of `karim`'s refresh sessions are revoked

### Requirement: Deactivate and reactivate
`POST /api/v1/users/:id/deactivate` (permission `user.deactivate`) with a required non-empty `reason` SHALL set status `INACTIVE`, revoke all refresh sessions and all open auth tokens of the user, write `user.deactivated` with the reason, and respond `200`. It MUST respond `409 LAST_SUPER_ADMIN` when deactivating the last ACTIVE Super Admin. Users MUST never be hard-deleted. `POST /api/v1/users/:id/reactivate` with `reason` SHALL set status `ACTIVE` if the user has a password, or `INVITED` otherwise, write `user.reactivated`, and respond `200`. Inactive users MUST receive no email. (USR-03, §2 hard rules 2 and 3)

#### Scenario: Deactivate logs user out everywhere
- **WHEN** a Super Admin deactivates Owner `karim` with reason "moved abroad"
- **THEN** `karim`'s sessions are revoked, his next refresh returns `401`, and login returns `401 INVALID_CREDENTIALS`

#### Scenario: Missing reason
- **WHEN** deactivate is called with an empty reason
- **THEN** the response is `422 VALIDATION_FAILED`

#### Scenario: Deactivate last Super Admin
- **WHEN** the last ACTIVE Super Admin is deactivated
- **THEN** the response is `409 LAST_SUPER_ADMIN`

### Requirement: Force logout
`POST /api/v1/users/:id/revoke-sessions` (permission `user.session.revoke`) SHALL revoke every refresh session of the target user, write `user.sessions.revoked`, and respond `204`. (USR-05)

#### Scenario: Force logout
- **WHEN** a Super Admin force-logs-out `karim`
- **THEN** all of `karim`'s refresh sessions are revoked

### Requirement: Birthday is not in the future (Asia/Dhaka)
The shared birthday rule used by create user, admin edit and self-service edit SHALL accept an ISO `YYYY-MM-DD` date, `null` or omission, and MUST reject a date after today's calendar date in Asia/Dhaka with `422 VALIDATION_FAILED` ("Birthday can't be in the future"). The comparison MUST use the Dhaka calendar date, not the UTC instant of `new Date("YYYY-MM-DD")`, so today's date is accepted at any hour in Dhaka.

#### Scenario: Today accepted in the early hours
- **WHEN** at 02:00 Asia/Dhaka on 2026-11-09 (still 2026-11-08 in UTC) a user saves birthday `2026-11-09`
- **THEN** the birthday is accepted

#### Scenario: Tomorrow rejected
- **WHEN** at the same moment a user saves birthday `2026-11-10`
- **THEN** the response is `422 VALIDATION_FAILED` with the birthday field error "Birthday can't be in the future"

### Requirement: Invite delivery state on the Users screen
The Users screen SHALL show, on each INVITED user's row, the delivery state of their latest invite: "Invite queued", "Invite sent" with the Asia/Dhaka send time, or "Invite not sent" with a plain-language reason for the failure code, in Bangla or English. A failed state MUST be visually distinct from sent (design-system negative tone) and MUST NOT rely on color alone. After a resend succeeds the list SHALL refetch so the state reflects the new invite.

#### Scenario: Failed invite reason shown
- **WHEN** an INVITED user's latest invite failed with `SENDER_NOT_VERIFIED`
- **THEN** the row reads "Invite not sent — sender address not verified"

#### Scenario: Resend refreshes state
- **WHEN** a Super Admin confirms "Resend invite" for a user whose invite failed
- **THEN** the row changes to "Invite queued"
