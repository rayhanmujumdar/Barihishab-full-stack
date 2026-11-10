## MODIFIED Requirements

### Requirement: Destructive actions require confirmation
Any UI control whose action ends a session, invalidates a token or link, removes or reduces a user's access, or deletes, voids or reverses data SHALL open a confirmation modal on activation and MUST NOT send any request to the server until the user explicitly confirms. Cancelling, pressing Escape, or closing the modal MUST send no request and leave state unchanged. This SHALL apply to at least: app-shell Log out (sidebar and the mobile More sheet), invite-screen "Log out to continue", `/me` per-session Log out, `/me` Log out all devices, admin Revoke invite, admin Resend invite, admin Deactivate, admin Reactivate, admin Log out everywhere, and saving a role change for an existing user (the server revokes that user's sessions on any role change). Any destructive control added later MUST follow the same rule. (Auth PRD §3.4, AUTH-05, AUTH-07, INV-04, INV-05, USR-02, USR-03, USR-05; design system: destructive actions always go through a dialog)

#### Scenario: Sidebar logout asks first
- **WHEN** a logged-in user clicks the Log out icon in the desktop sidebar
- **THEN** a confirmation modal titled "Log out?" opens and no `POST /api/v1/auth/logout` request is sent

#### Scenario: Confirmed logout proceeds
- **WHEN** the user clicks the Log out confirm button in that modal
- **THEN** `POST /api/v1/auth/logout` is sent once and on success the user lands on `/{lang}/login`

#### Scenario: Cancel keeps the session
- **WHEN** the user opens the logout modal and clicks Cancel
- **THEN** the modal closes, no logout request is sent, and the user stays on the same page still logged in

#### Scenario: Escape cancels
- **WHEN** the confirmation modal is open and the user presses Escape
- **THEN** the modal closes without sending any request

#### Scenario: Mobile More-sheet logout asks first
- **WHEN** a user on a 360px-wide screen opens More and taps Log out
- **THEN** the same confirmation modal opens before any request is sent

#### Scenario: Revoke one device
- **WHEN** a user clicks Log out next to a non-current session on `/me`
- **THEN** a modal naming that device and browser opens, and `DELETE /api/v1/me/sessions/{id}` is sent only after confirm

#### Scenario: Revoke invite asks first
- **WHEN** a Super Admin selects Revoke invite for an Invited user
- **THEN** a modal explains that the emailed link will stop working, and `POST /api/v1/users/{id}/revoke-invite` is sent only after confirm

#### Scenario: Resend invite asks first
- **WHEN** a Super Admin selects Resend invite for an Invited user
- **THEN** a modal explains that the previous link will stop working and a new 72-hour link will be emailed, and `POST /api/v1/users/{id}/resend-invite` is sent only after confirm

#### Scenario: Invite screen logout asks first
- **WHEN** a logged-in user on another person's invite link clicks "Log out to continue"
- **THEN** a confirmation modal opens, and the logout request is sent only after confirm

#### Scenario: Role demotion asks first
- **WHEN** a Super Admin edits another Super Admin, changes the role to Owner, and clicks Save
- **THEN** a modal warns that the user will lose admin access and be logged out on all devices, and no update request is sent until confirm

#### Scenario: Role promotion asks first
- **WHEN** a Super Admin changes an Owner's role to Super Admin and clicks Save
- **THEN** a modal warns that the user gets full admin access and will be logged out on all devices, and no update request is sent until confirm

#### Scenario: Plain edits do not ask
- **WHEN** a Super Admin saves profile-only edits or creates a new user
- **THEN** the save proceeds without a confirmation modal

