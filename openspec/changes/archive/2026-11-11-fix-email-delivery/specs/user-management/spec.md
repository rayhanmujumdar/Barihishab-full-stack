## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Invite delivery state on the Users screen
The Users screen SHALL show, on each INVITED user's row, the delivery state of their latest invite: "Invite queued", "Invite sent" with the Asia/Dhaka send time, or "Invite not sent" with a plain-language reason for the failure code, in Bangla or English. A failed state MUST be visually distinct from sent (design-system negative tone) and MUST NOT rely on color alone. After a resend succeeds the list SHALL refetch so the state reflects the new invite.

#### Scenario: Failed invite reason shown
- **WHEN** an INVITED user's latest invite failed with `SENDER_NOT_VERIFIED`
- **THEN** the row reads "Invite not sent — sender address not verified"

#### Scenario: Resend refreshes state
- **WHEN** a Super Admin confirms "Resend invite" for a user whose invite failed
- **THEN** the row changes to "Invite queued"
