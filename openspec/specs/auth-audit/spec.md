# auth-audit Specification

## Purpose

Keeps a tamper-resistant, append-only record of every authentication and user-administration event so the bookkeeper can see who did what, from where, and when. (Auth PRD AUD-01..02, §6 Audit action names)

## Requirements

### Requirement: Auth events are audited
The system SHALL write an audit row for each of: `auth.login.success`, `auth.login.failed`, `auth.locked`, `auth.logout`, `auth.logout_all`, `auth.password.changed`, `auth.password.reset`, `auth.invite.sent`, `auth.invite.accepted`, `auth.invite.revoked`, `user.created`, `user.updated`, `user.role.changed`, `user.deactivated`, `user.reactivated`, `user.sessions.revoked`. Each row MUST carry actor id (null for anonymous failures), action, entity type and id, before/after JSON where relevant, reason where given, IP, user agent and timestamp. The audit row MUST be written in the same transaction as the data change it describes. (AUD-01)

#### Scenario: Failed login audited
- **WHEN** a login fails for an existing user
- **THEN** an `auth.login.failed` row exists with entity id of that user, the request IP and user agent

#### Scenario: Role change audited with before/after
- **WHEN** a Super Admin changes a user's roles from `["OWNER"]` to `["OWNER","SUPER_ADMIN"]`
- **THEN** a `user.role.changed` row records both role sets

### Requirement: Audit rows contain no secrets
Audit `before`/`after` payloads MUST NOT contain password hashes, raw or hashed tokens, or cookie values.

#### Scenario: Password reset audit payload
- **WHEN** `auth.password.reset` is written
- **THEN** its payload contains no password or token material

### Requirement: Append-only at database level
The application database role MUST NOT be able to `UPDATE` or `DELETE` audit rows. (AUD-02)

#### Scenario: Update attempt
- **WHEN** the application role executes `UPDATE audit_logs SET action = 'x'`
- **THEN** the database rejects it with a permission error

### Requirement: Audit read endpoint
`GET /api/v1/audit` (permission `audit.view.all`) SHALL return `200 { items, nextCursor }` newest-first, filterable by `category=auth` (actions starting `auth.` or `user.`), `actorId`, `entityId`, with cursor pagination (default 50). Callers without the permission MUST receive `403 FORBIDDEN`.

#### Scenario: Super Admin reads auth audit
- **WHEN** a Super Admin calls `GET /api/v1/audit?category=auth`
- **THEN** only `auth.*` and `user.*` rows are returned, newest first

#### Scenario: Owner reads audit
- **WHEN** an Owner calls `GET /api/v1/audit?category=auth`
- **THEN** the response is `403 FORBIDDEN`
