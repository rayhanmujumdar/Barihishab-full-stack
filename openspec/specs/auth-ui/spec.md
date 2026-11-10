# auth-ui Specification

## Purpose

Gives household members bilingual, accessible screens for every authentication door (login, forgot, reset, accept invite) and for managing users and their own profile, built to the BariHisab design system. (Auth PRD §4 screens A1–A7, §8 Accessibility and Localization)

## Requirements

### Requirement: Bilingual auth screens
Every auth and account screen MUST render all strings in `bn` (default) and `en`, with a language toggle visible on all public auth screens and in the app shell. The chosen language MUST persist across reloads (cookie for anonymous users, `users.locale` once logged in). (§8 Localization)

#### Scenario: Default language
- **WHEN** a first-time visitor opens `/login`
- **THEN** all labels are in বাংলা

#### Scenario: Toggle to English
- **WHEN** the visitor switches to English and reloads
- **THEN** the page renders in English

### Requirement: Login screen (A1)
`/login` SHALL show identifier and password fields, a "Remember me for 30 days" checkbox, a Forgot password link, a language toggle and an error strip. Submit MUST be disabled until both fields contain text. Wrong credentials MUST show "Username/email or password is wrong." After the 3rd consecutive failure it MUST add "2 attempts left before a 15-minute lock." A locked account MUST show "Too many attempts. Try again in 15 minutes or reset your password." On success the user MUST be sent to a safe `next` path or `/`. A logged-in user opening `/login` MUST be redirected to `/`.

#### Scenario: Submit disabled when empty
- **WHEN** only the identifier is filled
- **THEN** the submit button is disabled

#### Scenario: Error strip receives focus
- **WHEN** a login fails
- **THEN** the generic error appears in the error strip and keyboard focus moves to it

#### Scenario: Locked message
- **WHEN** the API returns `423 ACCOUNT_LOCKED`
- **THEN** the locked message is shown

### Requirement: Forgot password screen (A2)
`/forgot` SHALL show an email field and "Send reset link". After submit it MUST always show "If that email has an account, a link is on its way." regardless of the API outcome (except rate limiting, which shows a retry message).

#### Scenario: Same message for unknown email
- **WHEN** an unknown email is submitted
- **THEN** the same success message is shown as for a real email

### Requirement: Reset password screen (A3)
`/reset/[token]` SHALL validate the token on load. For a valid token it MUST show new and repeat password fields with live checks (8+ characters, passwords match) and submit only when both pass. For an expired or used token it MUST show an expired-link state with a link to `/forgot` and no form. On success it MUST land the user logged in at `/`.

#### Scenario: Live mismatch check
- **WHEN** the repeat password differs from the new password
- **THEN** a "Passwords don't match" check is shown and submit is disabled

#### Scenario: Expired link
- **WHEN** the token validation returns `410`
- **THEN** the expired state with a "Request a new link" action is shown and no password form is rendered

### Requirement: Accept invite screen (A4)
`/invite/[token]` SHALL show "Welcome, {firstName}", the username read-only, new and repeat password fields with live checks, a language picker, and an expiry kicker (e.g. "expires in 71 h"). Expired tokens MUST show "This invite has expired. Ask {admin name} to send a new one." with no form. Used or revoked tokens MUST show "This invite was already used." with a Log in button. If a different user is already logged in, the screen MUST ask them to log out first.

#### Scenario: Valid invite renders form
- **WHEN** a valid invite is opened
- **THEN** the welcome text, read-only username, password fields and expiry kicker are shown

#### Scenario: Already logged in as someone else
- **WHEN** a logged-in user opens another person's invite link
- **THEN** a "Log out to continue" prompt is shown instead of the form

### Requirement: Role-aware home shell (A5)
`/` SHALL render the app shell (sidebar on desktop, bottom nav on mobile) for any logged-in user. Super Admins MUST additionally see a "Bookkeeper's desk" area including the pending-invites count; Owners MUST NOT see any admin block or admin navigation item.

#### Scenario: Super Admin home
- **WHEN** a Super Admin opens `/` with 2 INVITED users
- **THEN** the pending-invites block shows 2

#### Scenario: Owner home
- **WHEN** an Owner opens `/`
- **THEN** no Users nav item and no Bookkeeper's desk block is rendered

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

### Requirement: Date fields use the themed calendar picker
Date inputs on auth screens (birthday on `/me` and in the user drawer) SHALL use the shared `DateField` (shadcn Popover + Calendar) and MUST NOT use the native `<input type="date">`. The trigger MUST show the selected date in long localized form ("15 May 2000" / "১৫ মে ২০০০") or a placeholder when empty. The calendar MUST offer month and year dropdowns, use Bangla month names and Bangla digits when the locale is `bn`, start weeks on Sunday, and offer a "Clear date" action when a date is selected. For birthdays, days after today's calendar date in Asia/Dhaka MUST be disabled. The trigger's accessible name MUST be the field label plus the current value or placeholder. The value MUST be exchanged as an ISO `YYYY-MM-DD` string with no time-zone shift. The popover MUST stay inside the viewport, scrolling internally on short screens, and MUST stay operable inside the modal user drawer.

#### Scenario: Pick a birthday in the user drawer
- **WHEN** a Super Admin opens Edit for a user, opens the Birthday picker, chooses year 1990, month March and day 20, then saves
- **THEN** the popover closes, the trigger reads "20 March 1990" and the update request sends `birthday: "1990-03-20"`

#### Scenario: Future days are not selectable
- **WHEN** the Birthday picker is open
- **THEN** every day after today's date in Asia/Dhaka is disabled and the year dropdown ends at the current year

#### Scenario: Bangla calendar
- **WHEN** the Birthday picker is opened with locale `bn`
- **THEN** month names and day numbers are shown in Bangla (e.g. "নভেম্বর", "২০২৬")

#### Scenario: Short screen
- **WHEN** the picker opens in a viewport too short for the whole calendar
- **THEN** the popover is not clipped and can be scrolled with the mouse wheel, including inside the user drawer

### Requirement: Input placeholder hints
Every free-text input on the auth, profile and user-management screens SHALL show a short bilingual placeholder hint: an example or the expected format (e.g. `01XXXXXXXXX`, `name@example.com`, "e.g. Rahim", "যেমন: রহিম"). Placeholders MUST supplement the visible `<label>`, never replace it, and MUST use the neutral-700 muted text color so they meet contrast and are distinguishable from entered values.

#### Scenario: Bangla login hints
- **WHEN** `/bn/login` is rendered
- **THEN** the identifier and password inputs show Bangla placeholder hints under their visible labels

#### Scenario: Phone format hint
- **WHEN** the phone or WhatsApp field is empty on `/me` or in the user drawer
- **THEN** it shows the `01XXXXXXXXX` format hint

### Requirement: Design system and accessibility compliance
All auth screens MUST follow the BariHisab design system (ink-on-paper, zero radius, tokens only, one yellow signal, split layout on public auth pages with the wordmark panel, ink primary button with trailing arrow). Every field MUST have a real `<label>`, errors MUST be linked with `aria-describedby`, all interactive targets MUST be at least 44px tall, and every screen MUST be usable at 360px width. All pages MUST be `noindex`. (§4, §8 Accessibility, Privacy)

#### Scenario: Mobile width
- **WHEN** any auth screen is rendered at 360px width
- **THEN** there is no horizontal scrolling and the form is fully usable

#### Scenario: Noindex
- **WHEN** any page is requested
- **THEN** the response includes a `robots` `noindex` directive
