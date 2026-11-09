## Purpose

Lets a user who forgot their password regain access through a single-use emailed link, and lets a logged-in user change their password, while ending every other session so a leaked password stops working everywhere. (Auth PRD PWD-01..04, AUTH-06, §3.3)

## ADDED Requirements

### Requirement: Forgot password without enumeration
`POST /api/v1/auth/forgot` with `{ email }` MUST always respond `202` with the same body regardless of whether the email exists or the account is active. Only for an ACTIVE account SHALL the system revoke older open `RESET` tokens, create a new `RESET` token valid 1 hour, and queue a `RESET` email. (PWD-01, PWD-02)

#### Scenario: Real email
- **WHEN** an ACTIVE user's email is submitted
- **THEN** the response is `202` and one `RESET` outbox row is queued

#### Scenario: Unknown email
- **WHEN** an email with no account is submitted
- **THEN** the response is `202` with an identical body and nothing is queued

#### Scenario: Inactive account
- **WHEN** an INACTIVE user's email is submitted
- **THEN** the response is `202` and nothing is queued

### Requirement: Reset email throttling
The system MUST queue at most 3 reset emails per account per rolling hour; further requests MUST still respond `202` but MUST NOT create tokens or emails. (PWD-03)

#### Scenario: Fourth request within an hour
- **WHEN** a user requests a reset 4 times within 60 minutes
- **THEN** all four responses are `202` and only 3 `RESET` emails are queued

### Requirement: Reset token validation
`GET /api/v1/auth/reset/:token` SHALL respond `200 { valid: true }` for a valid token and `410 TOKEN_EXPIRED` or `410 TOKEN_USED` otherwise. A newer reset request MUST void older tokens. (PWD-02)

#### Scenario: Older link voided
- **WHEN** a user requests two resets and opens the first link
- **THEN** the response is `410 TOKEN_USED`

#### Scenario: Link older than 1 hour
- **WHEN** the token was issued 61 minutes ago
- **THEN** the response is `410 TOKEN_EXPIRED`

### Requirement: Reset password
`POST /api/v1/auth/reset` with `{ token, password }` SHALL, for a valid token, apply the password policy, store the new hash, mark the token used, revoke all of the user's refresh sessions, clear the failed-login counter and lock, queue a `PASSWORD_CHANGED` email, write `auth.password.reset`, create a fresh session for the caller, and respond `204` with auth cookies set. (AUTH-06)

#### Scenario: Reset logs out other devices
- **WHEN** a user logged in on browser B resets their password from browser A
- **THEN** browser B's refresh token is revoked and browser A has a new session

#### Scenario: Reset clears lock
- **WHEN** a locked user completes a reset
- **THEN** the lock and failure counter are cleared

### Requirement: Change own password
`POST /api/v1/me/password` (permission `profile.password.self`) with `{ currentPassword, newPassword }` SHALL verify the current password, apply the password policy, store the new hash, revoke all other refresh sessions of the user (keeping the current one, rotated), queue a `PASSWORD_CHANGED` email, write `auth.password.changed`, and respond `204`. A wrong current password MUST respond `401 INVALID_CREDENTIALS` and count toward lockout. (PWD-04, AUTH-06)

#### Scenario: Wrong current password
- **WHEN** a user submits an incorrect current password
- **THEN** the response is `401 INVALID_CREDENTIALS` and the password is unchanged

#### Scenario: Successful change
- **WHEN** a user submits the correct current password and a valid new one
- **THEN** the response is `204`, other sessions are revoked, the current session stays valid, and a `PASSWORD_CHANGED` email is queued
