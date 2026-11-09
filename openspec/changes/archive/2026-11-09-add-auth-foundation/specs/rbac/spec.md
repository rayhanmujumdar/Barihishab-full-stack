## Purpose

Decides on the server, by permission name rather than role name, what each authenticated user may do, and gives APIs and pages one consistent answer for "not logged in" versus "not allowed". (Auth PRD RBAC-01..06, §2)

## ADDED Requirements

### Requirement: Role to permission map
The system SHALL define exactly one role→permission map. v1 roles are `SUPER_ADMIN` and `OWNER` with the permissions listed in Auth PRD §2 (Super Admin: all 14 keys; Owner: `profile.update.self`, `profile.password.self`, `session.manage.self`, `audit.view.financial`). `ACCOUNTANT` and `VIEWER` MUST exist as role values with an empty permission set. A user's effective permissions MUST be the union over all their roles. (RBAC-02)

#### Scenario: Owner permissions
- **WHEN** the effective permissions of a user with only OWNER are computed
- **THEN** they equal exactly the four Owner keys

#### Scenario: Multiple roles union
- **WHEN** a user holds SUPER_ADMIN and OWNER
- **THEN** their permissions equal the full Super Admin set

### Requirement: Server-side permission check on every entry point
Every route handler, server action and page loader that reads or writes protected data MUST check the required permission on the server before doing work. Hiding UI MUST NOT be the only check. Proxy/edge logic MUST only check authentication, never permissions alone. (RBAC-01, §2 hard rule 4)

#### Scenario: Owner calls every admin endpoint
- **WHEN** an OWNER calls each `/api/v1/users/*` and `/api/v1/audit` endpoint directly
- **THEN** every response is `403 FORBIDDEN` and contains no user or audit data

### Requirement: Unauthenticated handling
An API request without a valid access token (and no successful transparent refresh) MUST return `401 UNAUTHENTICATED`. A protected page request MUST redirect to `/login?next=<original path>`. (RBAC-03)

#### Scenario: Anonymous API call
- **WHEN** an anonymous client calls `GET /api/v1/me`
- **THEN** the response is `401 UNAUTHENTICATED`

#### Scenario: Anonymous page visit
- **WHEN** an anonymous browser opens `/admin/users`
- **THEN** it is redirected to `/login?next=%2Fadmin%2Fusers`

### Requirement: Forbidden handling
An authenticated request lacking the permission MUST return `403 FORBIDDEN` for APIs and render a "You don't have access" view in place of the page content for pages, without loading or sending any of the protected data. (Pages are streamed under Cache Components, so their HTTP status stays 200; the API status is the enforced 403.) (RBAC-04)

#### Scenario: Owner opens admin page
- **WHEN** an OWNER opens `/admin/users`
- **THEN** the "You don't have access" view is shown and no user list is rendered or sent

### Requirement: Client permission hints
The session payload sent to the client MUST include the effective permission keys, and the UI MUST hide navigation items, buttons and dashboard blocks the user cannot use, using the same permission keys. (RBAC-05)

#### Scenario: Owner navigation
- **WHEN** an OWNER views any app page
- **THEN** no "Users", "Audit" or admin dashboard block is rendered

### Requirement: Property scoping
Every role grant and every query on property-scoped data MUST be filtered by `property_id`. In v1 one default property exists; a role row with `property_id = null` MUST be treated as global. (RBAC-06)

#### Scenario: Global grant
- **WHEN** a user's SUPER_ADMIN role row has `property_id = null`
- **THEN** they hold Super Admin permissions on the default property
