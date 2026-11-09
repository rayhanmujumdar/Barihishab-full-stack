## Purpose

Protects household members from accidental, irreversible clicks. Every action that ends a session, kills a link, removes access or destroys data asks for explicit confirmation in an accessible, bilingual modal before anything is sent to the server.

## ADDED Requirements

### Requirement: Destructive actions require confirmation
Any UI control whose action ends a session, invalidates a token or link, removes or reduces a user's access, or deletes, voids or reverses data SHALL open a confirmation modal on activation and MUST NOT send any request to the server until the user explicitly confirms. Cancelling, pressing Escape, or closing the modal MUST send no request and leave state unchanged. This SHALL apply to at least: app-shell Log out (sidebar and mobile bottom nav), invite-screen "Log out to continue", `/me` per-session Log out, `/me` Log out all devices, admin Revoke invite, admin Resend invite, admin Deactivate, admin Reactivate, admin Log out everywhere, and saving a role change for an existing user (the server revokes that user's sessions on any role change). Any destructive control added later MUST follow the same rule. (Auth PRD §3.4, AUTH-05, AUTH-07, INV-04, INV-05, USR-02, USR-03, USR-05; design system: destructive actions always go through a dialog)

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

#### Scenario: Mobile bottom-nav logout asks first
- **WHEN** a user on a 360px-wide screen taps Log out in the bottom nav
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

### Requirement: Confirmation modal content and controls
The confirmation modal SHALL show a title naming the action (including the affected person's name, or the device for sessions), a body stating the consequence in plain words, a **Cancel** button and a confirm button labelled with the action verb (for example "Log out", "Revoke invite", "Deactivate"), not a generic "OK". The confirm button for destructive actions MUST use the destructive visual style. Actions the PRD requires a reason for (Deactivate, Reactivate) MUST show a required reason field and keep the confirm button disabled until the trimmed reason is non-empty (max 500 characters).

#### Scenario: Action-specific labels
- **WHEN** the Revoke invite modal opens for user "Karim"
- **THEN** the title names Karim and the confirm button reads "Revoke invite"

#### Scenario: Reason required for deactivate
- **WHEN** the Deactivate modal is open and the reason field is empty or only spaces
- **THEN** the confirm button is disabled

### Requirement: No double submit and visible failure
While a confirmed action is in flight the confirm and cancel buttons MUST be disabled and the modal MUST NOT be dismissible, so the request is sent at most once per confirmation. If the request fails, the modal MUST close (or stay open showing the error) and the error MUST be shown to the user. The UI MUST NOT pretend the action succeeded. For logout specifically, a failure other than `401` MUST keep the user in the app and show "Couldn't log out — try again" (existing `common.logoutFailed`).

#### Scenario: Double click sends once
- **WHEN** the user double-clicks the confirm button
- **THEN** exactly one request is sent

#### Scenario: Logout failure surfaces
- **WHEN** the user confirms logout and the API returns `500`
- **THEN** the user stays on the current page and an error toast is shown

### Requirement: Accessible, bilingual confirmation
The modal SHALL be exposed as an `alertdialog` with an accessible name (its title) and description (its body). On open, keyboard focus MUST move to the Cancel button (the safe choice). Focus MUST stay inside the modal while open and MUST return to the triggering control on close. All modal strings MUST exist in `bn` (default) and `en` and render in the active locale, with numbers in Bangla digits when the locale is `bn`.

#### Scenario: Safe default focus
- **WHEN** any confirmation modal opens
- **THEN** the Cancel button has keyboard focus, so pressing Enter immediately cancels

#### Scenario: Focus returns
- **WHEN** the user cancels the sidebar logout modal
- **THEN** focus returns to the sidebar Log out button

#### Scenario: Bangla strings
- **WHEN** the locale is `bn` and the logout modal opens
- **THEN** the title, body and both buttons render in বাংলা
