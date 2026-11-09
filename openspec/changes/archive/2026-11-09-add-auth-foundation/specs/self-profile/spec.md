## Purpose

Lets every logged-in user view and edit their own profile and see and end their own sessions, while keeping identity fields (email, username) under Super Admin control for Owners. (Auth PRD USR-06, AUTH-07 subset, §4 A7)

## ADDED Requirements

### Requirement: Read own profile
`GET /api/v1/me` SHALL respond `200 { profile }` with the caller's own profile fields, roles and permissions, and `401` when unauthenticated.

#### Scenario: Read profile
- **WHEN** a logged-in Owner calls `GET /api/v1/me`
- **THEN** the response contains their names, phone, locale, roles and permissions and no password hash

### Requirement: Update own profile
`PATCH /api/v1/me` (permission `profile.update.self`) SHALL update first/last/surname, birthday, profession, phone, WhatsApp, `whatsappSameAsPhone` and locale with the shared validation rules, write `user.updated`, and respond `200`. Changing `email` or `username` additionally requires `profile.identity.self`; without it the request MUST respond `403 FORBIDDEN` and change nothing. (USR-06)

#### Scenario: Owner updates phone
- **WHEN** an Owner patches phone `01812345678`
- **THEN** the response is `200` and the phone is updated

#### Scenario: Owner tries to change email
- **WHEN** an Owner patches `email`
- **THEN** the response is `403 FORBIDDEN` and no field is changed

#### Scenario: Super Admin changes own username
- **WHEN** a Super Admin patches their username to a free valid value
- **THEN** the response is `200`

### Requirement: Own session list and single revoke
`GET /api/v1/me/sessions` (permission `session.manage.self`) SHALL respond `200` with the caller's active refresh sessions as `{ id, device, browser, ip, createdAt, lastSeenAt, current }`. `DELETE /api/v1/me/sessions/:id` SHALL revoke that session if it belongs to the caller and respond `204`; a session of another user MUST respond `404 NOT_FOUND`. Revoking the current session MUST also clear the caller's cookies. (AUTH-07 subset)

#### Scenario: List shows current session
- **WHEN** a user logged in on two browsers lists sessions
- **THEN** two items are returned and exactly one has `current = true`

#### Scenario: Revoke another user's session
- **WHEN** a user deletes a session id owned by someone else
- **THEN** the response is `404 NOT_FOUND` and the session stays active
