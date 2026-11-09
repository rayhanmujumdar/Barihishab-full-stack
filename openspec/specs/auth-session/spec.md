# auth-session Specification

## Purpose

Lets an invited, active BariHisab user prove who they are with username or email plus password, and keeps that identity across requests through a short-lived access token and a revocable, rotating refresh token. (Auth PRD AUTH-01..05, §3.2, §3.4, §8)

## Requirements

### Requirement: Login with username or email
The system SHALL accept `POST /api/v1/auth/login` with `{ identifier, password, remember }`, where `identifier` is either the username or the email, matched case-insensitively. On success it MUST respond `200` with `{ user, roles, permissions }` and set the access-token and refresh-token cookies. (AUTH-01)

#### Scenario: Login with username in mixed case
- **WHEN** an ACTIVE user with username `rahim` submits identifier `RaHiM` and the correct password
- **THEN** the response is `200` with the user's profile, roles and permission keys, and both auth cookies are set

#### Scenario: Login with email
- **WHEN** an ACTIVE user with email `rahim@example.com` submits identifier `Rahim@Example.com` and the correct password
- **THEN** the response is `200` and both auth cookies are set

#### Scenario: Successful login records state
- **WHEN** a login succeeds
- **THEN** the user's failed-login counter is reset to 0, `last_login_at` is set to now, a new refresh-session row is created, and an `auth.login.success` audit row is written with IP and user agent

### Requirement: Generic login failure without enumeration
The system MUST respond `401 INVALID_CREDENTIALS` with one identical message for an unknown identifier, a wrong password, an INACTIVE account and an INVITED account with no password. Failed attempts MUST incur a small fixed delay. (AUTH-01, §8 Enumeration)

#### Scenario: Unknown identifier
- **WHEN** the identifier matches no user
- **THEN** the response is `401` with code `INVALID_CREDENTIALS` and message "Username/email or password is wrong."

#### Scenario: Deactivated user with correct password
- **WHEN** an INACTIVE user submits the correct password
- **THEN** the response is `401 INVALID_CREDENTIALS` with the same message as a wrong password and no cookies are set

#### Scenario: Invited user who has not set a password
- **WHEN** an INVITED user without a password attempts to log in
- **THEN** the response is `401 INVALID_CREDENTIALS`

### Requirement: Account lockout after repeated failures
The system SHALL count consecutive wrong-password attempts per account. On the 5th consecutive failure it MUST set the account locked for 15 minutes and write an `auth.locked` audit row. While locked, login MUST respond `423 ACCOUNT_LOCKED` with `details.retryAfter` in seconds, even with the correct password. After the 3rd failure the response MUST include `details.attemptsLeft`. (AUTH-03)

#### Scenario: Fifth wrong password locks account
- **WHEN** a user submits a wrong password 5 times in a row
- **THEN** the 5th response is `423 ACCOUNT_LOCKED` with `details.retryAfter` ≈ 900 and the account is locked until now + 15 minutes

#### Scenario: Correct password during lock still fails
- **WHEN** a locked user submits the correct password before the lock expires
- **THEN** the response is `423 ACCOUNT_LOCKED` and no cookies are set

#### Scenario: Lock expires
- **WHEN** 15 minutes have passed since the lock and the user submits the correct password
- **THEN** login succeeds and the failure counter is reset

#### Scenario: Attempts-left hint
- **WHEN** a user submits the 3rd consecutive wrong password
- **THEN** the `401` response includes `details.attemptsLeft = 2`

### Requirement: Rate limiting on auth endpoints
The system MUST limit `/api/v1/auth/*` to 10 requests per minute per client IP and 5 login attempts per minute per identifier. Exceeding either limit MUST return `429 RATE_LIMITED` with a `Retry-After` header. (AUTH-04)

#### Scenario: IP limit exceeded
- **WHEN** one IP sends an 11th request to `/api/v1/auth/login` within 60 seconds
- **THEN** the response is `429 RATE_LIMITED` with a `Retry-After` header

#### Scenario: Identifier limit exceeded across IPs
- **WHEN** 6 login attempts for identifier `rahim` arrive within 60 seconds from different IPs
- **THEN** the 6th response is `429 RATE_LIMITED`

### Requirement: Access token and refresh token lifecycle
On login, invite acceptance or password reset the system SHALL issue a signed access token valid for 15 minutes and an opaque refresh token. Both MUST be delivered only as `httpOnly`, `SameSite=Lax`, `Path=/` cookies, `Secure` outside local development. The refresh token MUST be stored server-side only as a SHA-256 hash. With `remember = true` the refresh token MUST be valid for 30 days (persistent cookie). With `remember = false` the refresh cookie MUST be a browser-session cookie and the refresh session MUST expire after 12 hours without use or 7 days after creation, whichever comes first. (AUTH-02, §8 Session lifetime)

#### Scenario: Remember me issues 30-day refresh token
- **WHEN** a user logs in with `remember = true`
- **THEN** the access cookie expires in 15 minutes and the refresh cookie has `Max-Age` of 30 days

#### Scenario: Without remember me
- **WHEN** a user logs in with `remember = false`
- **THEN** the refresh cookie has no `Max-Age`/`Expires` and the server-side session expires after 12 h idle or 7 days absolute

#### Scenario: Raw tokens never stored
- **WHEN** a session is created
- **THEN** the database contains only the SHA-256 hash of the refresh token and no access token

### Requirement: Refresh with rotation and reuse detection
The system SHALL accept `POST /api/v1/auth/refresh` using the refresh cookie. If the refresh session is valid, not revoked, not expired, and the user is ACTIVE, it MUST issue a new access token and a new refresh token, invalidating the presented one. If a previously rotated refresh token is presented again, the system MUST revoke every session in that token family and respond `401 UNAUTHENTICATED`. Requests carrying an expired access token and a valid refresh token MUST be refreshed transparently for page navigations.

#### Scenario: Valid refresh
- **WHEN** a client with a valid refresh cookie calls refresh after the access token expired
- **THEN** the response is `200`, new access and refresh cookies are set, and the old refresh token no longer works

#### Scenario: Refresh token reuse
- **WHEN** a refresh token that was already rotated is presented
- **THEN** the response is `401 UNAUTHENTICATED` and all sessions in that family are revoked

#### Scenario: Refresh for deactivated user
- **WHEN** a deactivated user's refresh token is presented
- **THEN** the response is `401 UNAUTHENTICATED` and auth cookies are cleared

### Requirement: Session introspection
The system SHALL expose `GET /api/v1/auth/session` returning `200 { user, roles, permissions, csrfToken }` for an authenticated caller and `401 UNAUTHENTICATED` otherwise.

#### Scenario: Authenticated session read
- **WHEN** a logged-in user calls `GET /api/v1/auth/session`
- **THEN** the response contains their user, roles, permission keys and a CSRF token

#### Scenario: Anonymous session read
- **WHEN** a caller without valid auth cookies calls it
- **THEN** the response is `401 UNAUTHENTICATED`

### Requirement: Logout and logout from all devices
`POST /api/v1/auth/logout` SHALL revoke the current refresh session, clear both cookies, write `auth.logout`, and respond `204`. `POST /api/v1/auth/logout-all` SHALL revoke every refresh session of the user, clear cookies, write `auth.logout_all`, and respond `204`. After revocation, refresh MUST fail for the revoked sessions. (AUTH-05)

#### Scenario: Logout
- **WHEN** a logged-in user calls logout
- **THEN** the response is `204`, both cookies are cleared and the refresh token can no longer be used

#### Scenario: Logout all ends a second browser
- **WHEN** a user logged in on browsers A and B calls logout-all from A
- **THEN** browser B's next refresh returns `401` and B is sent to `/login` within at most 15 minutes, and immediately on any endpoint that performs a revocation check

### Requirement: Immediate revocation on sensitive endpoints
Endpoints guarded by any `user.*`, `audit.view.all` or `settings.manage` permission, and all `/api/v1/me/password` and `/api/v1/me/sessions` calls, MUST verify that the caller's refresh session is still active and the user is ACTIVE, not only that the access token signature is valid.

#### Scenario: Revoked admin calls admin endpoint with unexpired access token
- **WHEN** a Super Admin's sessions are revoked and they call `GET /api/v1/users` with a still-unexpired access token
- **THEN** the response is `401 UNAUTHENTICATED`

### Requirement: CSRF protection
Every `POST`, `PATCH`, `PUT` and `DELETE` request to `/api/v1/*` that relies on cookie auth MUST carry an `X-CSRF-Token` header matching the CSRF cookie and MUST have an `Origin` header equal to the app origin; otherwise the system MUST respond `403 CSRF_INVALID`. Public pre-session endpoints (`login`, `forgot`, `reset`, `accept-invite`) MUST still enforce the `Origin` check. (§7, §8 CSRF)

#### Scenario: Missing CSRF header
- **WHEN** a logged-in user sends `POST /api/v1/auth/logout-all` without `X-CSRF-Token`
- **THEN** the response is `403 CSRF_INVALID` and no session is revoked

#### Scenario: Foreign origin
- **WHEN** a `POST /api/v1/auth/login` arrives with `Origin: https://evil.example`
- **THEN** the response is `403 CSRF_INVALID`

### Requirement: Secure password storage
Passwords MUST be stored only as Argon2id hashes (memory 19 MiB, iterations 2, parallelism 1). If a stored hash uses outdated parameters, the system MUST re-hash it on the next successful login. Passwords, tokens and cookie values MUST NOT appear in logs or error responses. (§8 Password hashing, Logging)

#### Scenario: Hash format
- **WHEN** a user sets a password
- **THEN** the stored value is an Argon2id encoded hash and never the plaintext

#### Scenario: Rehash on login
- **WHEN** a user whose hash uses older parameters logs in successfully
- **THEN** the stored hash is replaced with one using current parameters

### Requirement: Password policy
Any password set by a user MUST be 8–128 characters, MUST NOT equal the username or email (case-insensitive), and MUST NOT appear in the bundled top-10k breached-password list; otherwise the system MUST respond `422 VALIDATION_FAILED` with the failing field in `details.fields`. (§4 Validation)

#### Scenario: Password equals username
- **WHEN** user `rahimuddin` tries to set password `RahimUddin`
- **THEN** the response is `422 VALIDATION_FAILED` with `details.fields.password`

#### Scenario: Common password
- **WHEN** a user tries to set password `password123`
- **THEN** the response is `422 VALIDATION_FAILED`

### Requirement: Safe post-login redirect
The login UI and any server redirect MUST accept a `next` parameter only if it starts with `/` and not `//` or `/\`; otherwise it MUST redirect to `/`. (§8 Open redirect)

#### Scenario: External next rejected
- **WHEN** a user logs in from `/login?next=//evil.example`
- **THEN** they are redirected to `/`

#### Scenario: Internal next honoured
- **WHEN** a user logs in from `/login?next=/admin/users`
- **THEN** they are redirected to `/admin/users`
