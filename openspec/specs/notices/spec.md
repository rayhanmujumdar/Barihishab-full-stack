# notices Specification

## Purpose

House notices from the Super Admin to every member: publishing with email, simple formatting, pinning to Home with an optional end date, editing, archiving, and per-member read tracking with a who-has-read list and reminders for urgent notices.

## Requirements

### Requirement: Notice record
The system SHALL store a notice per property with title (1–120 characters), body (1–3,000 characters), priority `NORMAL` or `URGENT`, pinned flag, optional pin-until date, published time and author, optional edited time, and optional archived time and archiving user. Notices MUST NOT be deletable (database refuses DELETE); they are only archived. "Active members" MUST mean users with status ACTIVE holding SUPER_ADMIN or OWNER for the property; INVITED and INACTIVE users are never members for counts or email. (§3, Rule 5, NTC-01)

#### Scenario: Delete refused
- **WHEN** a `DELETE FROM notices` is attempted
- **THEN** the database raises an error and the row remains

#### Scenario: Invited user is not a member
- **WHEN** the house has 4 ACTIVE members and Sabrina is INVITED
- **THEN** the active member count is 4

### Requirement: List notices
`GET /api/v1/notices` (permission `notice.view`) SHALL return the property's non-archived notices ordered pinned first (newest first) then the rest newest first, each with id, title, body, priority, pinned (effective), pinUntil, publishedAt, author name, editedAt, attachments, `readCount` (reads by current active members), `memberCount` (current active members) and `read` for the viewer; plus `activeMembers`, `unread` (the viewer's unread non-archived count) and, with `notice.manage`, `reachEmail` (members who would be emailed for a normal notice). `?archived=1` SHALL return archived notices newest first instead. Results are paged with `limit` (default 50, max 200). A notice is effectively pinned only while `pinned` is true, it is not archived, and either `pinUntil` is empty or today in Asia/Dhaka is on or before `pinUntil`. (N1, N3, N4, G2, §12.1)

#### Scenario: Nasrin's list on 22 Oct
- **WHEN** Nasrin lists notices on 22 Oct 2026 with "Water tank cleaning" (urgent, pinned until 26 Oct, 20 Oct, 2 of 4 read, unread by her), "Holding tax" (pinned, 2 Oct, 2 of 4 read) and "September accounts are closed" (3 Oct, 4 of 4 read)
- **THEN** the order is Water tank, Holding tax, September accounts, and Water tank has `read: false`, `readCount: 2`, `memberCount: 4`

#### Scenario: Pin until passed
- **WHEN** the same list is read on 27 Oct 2026
- **THEN** "Water tank cleaning" has `pinned: false` and sorts by date among unpinned notices

#### Scenario: Archived hidden
- **WHEN** a notice is archived
- **THEN** it is absent from `GET /notices` and present in `GET /notices?archived=1`

### Requirement: Publish a notice
`POST /api/v1/notices` (permission `notice.manage`) SHALL validate title, body, priority, pinned, optional pinUntil (today or later) and up to 5 attachment ids, then in one transaction create the notice, link the attachments, record the author's own read, write `notice.published` to the audit log and queue one `NOTICE` email (event `PUBLISHED`) per active member, skipping members who turned notices & complaints emails off unless the notice is URGENT. It SHALL respond `201` with the notice and `emailed` (rows queued). Missing title MUST fail with "Add a title." and missing body with "Write the message." (N2, Rule 1, Rule 3, §10)

#### Scenario: Urgent notice published
- **WHEN** the Super Admin publishes an URGENT notice "Water tank cleaning — Sunday 26 Oct" in a house with 4 active members, one of whom opted out
- **THEN** the response is `201` with `emailed: 4`, the author's read is recorded and `readCount` is 1

#### Scenario: Normal notice respects opt-out
- **WHEN** the same house receives a NORMAL notice
- **THEN** `emailed` is 3

#### Scenario: Owner refused
- **WHEN** an Owner posts a notice
- **THEN** the response is `403 FORBIDDEN` and nothing is created

#### Scenario: Empty title
- **WHEN** the title is blank
- **THEN** the response is `422` with "Add a title." on `title`

### Requirement: Edit, pin and archive
`PATCH /api/v1/notices/{id}` (permission `notice.manage`) SHALL change any of title, body, priority, pinned, pinUntil (null clears it), add attachments (total ≤ 5) and remove attachments; a change to title, body, priority or attachments MUST set `editedAt`, a pin-only change MUST NOT. With `emailChange: true` it SHALL queue a `NOTICE` email (event `EDITED`) to active members under the same opt-out rule as publishing. `POST /api/v1/notices/{id}/archive` SHALL set the archived time and user. Archived notices are read-only: PATCH, archive and remind MUST respond `409 NOTICE_ARCHIVED`. Each change writes one audit row (`notice.edited`, `notice.pinned`, `notice.unpinned`, `notice.archived`). (N3, G1, Rule 5)

#### Scenario: Edit shows Edited
- **WHEN** the Super Admin fixes a typo in the body without emailing
- **THEN** `editedAt` is set and no outbox row is queued

#### Scenario: Unpin is not an edit
- **WHEN** the Super Admin unpins a notice
- **THEN** `pinned` is false and `editedAt` is unchanged

#### Scenario: Edit archived refused
- **WHEN** an archived notice is patched
- **THEN** the response is `409 NOTICE_ARCHIVED`

### Requirement: Read tracking
`POST /api/v1/notices/{id}/read` (permission `notice.view`) SHALL record that the viewer read the notice (idempotent; the first read time is kept) and `POST /api/v1/notices/read-all` SHALL record reads for every unread non-archived notice; reads MUST never be undone. Reading the list MUST NOT record reads. (N4, G5, Rule 4)

#### Scenario: Mark as read
- **WHEN** Nasrin marks "Water tank cleaning" as read
- **THEN** its `readCount` becomes 3 for everyone and her `unread` drops by 1

#### Scenario: Second read keeps time
- **WHEN** she marks it read again later
- **THEN** the stored read time is the first one

### Requirement: Who has read
`GET /api/v1/notices/{id}/reads` (permission `notice.manage`) SHALL return two lists over current active members: `read` (name, read time, oldest first) and `notRead` (name). Owners MUST receive `403 FORBIDDEN`. (N4, G6)

#### Scenario: Two of four
- **WHEN** Rayhan and Tanvir read the notice and Farzana and Nasrin did not
- **THEN** `read` lists Rayhan and Tanvir with times and `notRead` lists Farzana and Nasrin

### Requirement: Remind unread
`POST /api/v1/notices/{id}/remind` (permission `notice.manage`) SHALL, for an URGENT non-archived notice, queue one `NOTICE` email (event `REMINDER`) to each active member who has not read it (opt-out ignored), write `notice.reminded`, and respond with `reminded` (count). A second reminder on the same Asia/Dhaka day MUST respond `409 REMINDER_ALREADY_SENT`; a NORMAL notice MUST respond `409 NOT_URGENT`. (N4, G6, §10 "Reminder sent to {n} members who haven't read it")

#### Scenario: Remind two
- **WHEN** the urgent notice has 2 of 4 reads and the Super Admin reminds
- **THEN** 2 outbox rows are queued and `reminded` is 2

#### Scenario: Twice in one day
- **WHEN** the Super Admin reminds again the same day
- **THEN** the response is `409 REMINDER_ALREADY_SENT` and nothing is queued

### Requirement: Notice formatting
Notice bodies SHALL support exactly three formats: `**bold**`, lines starting with `- ` as a bullet list, and `[text](url)` links where url is `http`, `https` or `mailto`; everything else MUST be shown as plain text and raw HTML MUST never be rendered, in the app or in emails. (G4)

#### Scenario: Script tag shown as text
- **WHEN** a body contains `<script>alert(1)</script>`
- **THEN** it is displayed as literal text and no script runs

#### Scenario: Unsafe link scheme
- **WHEN** a body contains `[x](javascript:alert(1))`
- **THEN** it is shown as plain text, not a link

### Requirement: Pinned notices for Home
The notices provider SHALL return, for a viewer, up to 3 effectively pinned non-archived notices newest first (id, title, body, urgent, date, unread) and whether more exist; unpinned, expired or archived notices MUST leave Home immediately. (N5, Rule 6)

#### Scenario: Four pinned
- **WHEN** four notices are effectively pinned
- **THEN** the three newest are returned and `more` is true

### Requirement: Notice audit
Every notice publish, edit, pin, unpin, archive and reminder SHALL write one audit row with actor and before/after where relevant; these actions MUST be non-financial (not shown in the owners' financial audit view). (Rule 16)

#### Scenario: Archive audited
- **WHEN** the Super Admin archives a notice
- **THEN** one `notice.archived` row exists with the actor
