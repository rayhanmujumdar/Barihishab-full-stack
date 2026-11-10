## MODIFIED Requirements

### Requirement: User management screen (A6)
`/admin/users` SHALL show a table with Person (avatar — the user's photo, or initials when there is none — name, username), Role, House responsibility, Status tag (Invited / Active / Inactive), Last login and row actions; search and role/status filters; a right-side "New user" drawer (540px on desktop, full-width on mobile) with the USR-01 fields plus an optional Photo field; row actions Edit, Resend invite (Invited only), Revoke invite, Deactivate/Reactivate (confirm dialog with required reason), Log out everywhere. The Photo field SHALL let the Super Admin pick an image, show a square preview before saving, and (in Edit) change or remove the existing photo; removing an existing photo MUST ask for confirmation first. Saving the drawer MUST upload the picked photo before submitting the form and send its `avatarId` with the create/edit request; an upload failure MUST show an error on the Photo field and keep the drawer open with all entered values. For the last active Super Admin, Deactivate and role change MUST be disabled with an explanatory tooltip.

#### Scenario: Create user from drawer
- **WHEN** a Super Admin fills the drawer and saves
- **THEN** the drawer closes, the new user appears with status Invited, and a success message confirms the invite was sent

#### Scenario: Create user with photo from drawer
- **WHEN** a Super Admin picks a photo in the New user drawer, fills the required fields and saves
- **THEN** the new user's row shows the photo in the Person column

#### Scenario: Photo upload fails in drawer
- **WHEN** the photo upload fails while saving the drawer
- **THEN** the Photo field shows an error, no user is created, and the drawer stays open with the entered values

#### Scenario: Field errors from API
- **WHEN** the API returns `409 EMAIL_TAKEN`
- **THEN** the email field shows the error, linked via `aria-describedby`

#### Scenario: Last admin guard in UI
- **WHEN** the list contains exactly one active Super Admin
- **THEN** that row's Deactivate action and role selector are disabled with a tooltip

### Requirement: Profile and security screen (A7)
`/me` SHALL show a Photo block (current photo or initials, "Change photo" and, when a photo exists, "Remove photo"), editable profile fields (email/username read-only for Owners), a change-password form requiring the current password, the active-sessions list with per-session "Log out" and a "Log out all devices" action. "Change photo" SHALL open a file picker, upload the prepared image and save it immediately (independent of the profile form's Save button), then show the new photo in the Photo block and the shell. "Remove photo" MUST open a confirmation dialog before removing.

#### Scenario: Owner sees identity read-only
- **WHEN** an Owner opens `/me`
- **THEN** email and username are displayed read-only with "Ask Admin to change"

#### Scenario: Owner changes own photo
- **WHEN** an Owner chooses "Change photo" and picks a JPG
- **THEN** the Photo block and the shell user block show the new photo and a success toast appears

#### Scenario: Remove photo asks first
- **WHEN** a user with a photo clicks "Remove photo"
- **THEN** a confirmation dialog opens, and only after confirming is the photo replaced by initials

#### Scenario: Log out all devices
- **WHEN** the user confirms "Log out all devices"
- **THEN** they are signed out and redirected to `/login`
