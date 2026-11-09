# invite-onboarding Specification

## Purpose

Provides the only way a new person gets a BariHisab account: a Super Admin creates them, they receive a single-use invite link, and they set their own password. Also bootstraps the very first Super Admin. (Auth PRD INV-01..05, BOOT-01..02, §3.1)

## Requirements

### Requirement: No public sign-up
The system MUST NOT expose any endpoint or page that creates an account without the `user.create` permission. Any better-auth or other default sign-up route MUST be disabled and return `404` or `403`. (INV-01)

#### Scenario: Direct sign-up attempt
- **WHEN** an anonymous client posts to any sign-up path (e.g. `/api/auth/sign-up/email`)
- **THEN** no user is created and the response is `404` or `403`

#### Scenario: Owner tries to create a user
- **WHEN** an OWNER calls `POST /api/v1/users`
- **THEN** the response is `403 FORBIDDEN` and no user is created

### Requirement: Invite issued on user creation
When a user is created, the system SHALL in one transaction create the user with status `INVITED` and no password, create the role row, create an `INVITE` token valid 72 hours (stored as SHA-256 hash of 32 random bytes), queue an `INVITE` email in the user's locale, and write `user.created` and `auth.invite.sent` audit rows. (INV-02)

#### Scenario: Invite created
- **WHEN** a Super Admin creates user `karim` with role OWNER and locale `bn`
- **THEN** `karim` has status `INVITED`, one active `INVITE` token expiring in 72 h exists, one `INVITE` outbox row with locale `bn` is queued, and both audit rows exist

### Requirement: Invite validation
`GET /api/v1/auth/invite/:token` SHALL return `200 { firstName, username, invitedBy, expiresAt }` for a valid token. It MUST return `410 TOKEN_EXPIRED` for an expired token and `410 TOKEN_USED` for a used or revoked token, and MUST NOT reveal whether an unknown token ever existed (unknown → `410 TOKEN_EXPIRED`). Token comparison MUST be constant-time on the hash.

#### Scenario: Valid invite
- **WHEN** a client opens a valid invite token
- **THEN** the response is `200` with first name, username, inviter name and expiry

#### Scenario: Expired invite
- **WHEN** the token was issued more than 72 h ago
- **THEN** the response is `410 TOKEN_EXPIRED` with the inviter's name in `details.invitedBy`

#### Scenario: Used invite
- **WHEN** the token has already been accepted
- **THEN** the response is `410 TOKEN_USED`

### Requirement: Accept invite
`POST /api/v1/auth/accept-invite` with `{ token, password, locale }` SHALL, for a valid token, hash and store the password, mark the token used, set status `ACTIVE`, set the user's locale, write `auth.invite.accepted`, create a refresh session (remember = false), set auth cookies and respond `200 { user }`. The password policy MUST apply. A token MUST work only once. (INV-03)

#### Scenario: Successful accept
- **WHEN** an invited user submits a valid token and a policy-compliant password
- **THEN** the response is `200`, the user is ACTIVE, auth cookies are set and the token is marked used

#### Scenario: Second use
- **WHEN** the same token is submitted again
- **THEN** the response is `410 TOKEN_USED` and the password is unchanged

### Requirement: Resend invite
`POST /api/v1/users/:id/resend-invite` (permission `user.invite.resend`) SHALL, for an INVITED user, revoke all open `INVITE` tokens of that user, issue a new 72 h token, queue a new invite email, write `auth.invite.sent`, and respond `202`. For a non-INVITED user it MUST respond `409` with code `NOT_INVITED`. (INV-04)

#### Scenario: Resend kills old link
- **WHEN** a Super Admin resends an invite
- **THEN** the old token returns `410 TOKEN_USED` and the new token validates

### Requirement: Revoke invite
`POST /api/v1/users/:id/revoke-invite` (permission `user.invite.resend`) SHALL revoke all open `INVITE` tokens of the user, write `auth.invite.revoked`, and respond `204`. (INV-05)

#### Scenario: Revoked link dies at once
- **WHEN** a Super Admin revokes an invite and the user then opens the link
- **THEN** the validation endpoint returns `410 TOKEN_USED`

### Requirement: First Super Admin bootstrap
A seed command SHALL create the default property (if missing) and, if no user holding `SUPER_ADMIN` exists, create one from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_USERNAME` with status `INVITED`, issue an invite token, and print the one-time invite URL to stdout (and queue the invite email when email is configured). If a Super Admin already exists, it MUST change nothing and exit successfully. Missing env vars MUST fail with a clear message. (BOOT-01, BOOT-02)

#### Scenario: First run
- **WHEN** the seed runs on an empty database with both env vars set
- **THEN** exactly one SUPER_ADMIN user exists and an invite URL is printed

#### Scenario: Second run is a no-op
- **WHEN** the seed runs again
- **THEN** the user count, token count and outbox count are unchanged
