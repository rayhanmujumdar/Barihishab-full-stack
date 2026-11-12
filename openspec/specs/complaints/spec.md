# complaints Specification

## Purpose

Written complaints and objections from any member, optionally linked to the entry, month, payment, loan, request or share change being questioned, with visibility control, a comment thread, a Super Admin decision with a required explanation, withdraw/reopen, and Questioned markers on the linked items.

## Requirements

### Requirement: Complaint record
The system SHALL store a complaint per property with title (1–120), body (10–2,000), visibility `ALL` (Everyone) or `ADMIN` (Admin only), status `OPEN`, `IN_REVIEW`, `RESOLVED`, `REJECTED` or `WITHDRAWN`, optional link (type `ENTRY`, `MONTH`, `LEDGER`, `LOAN`, `REQUEST` or `SHARE_SET` plus id), the linked month (the month itself for `MONTH`, the entry's or payment's period for `ENTRY`/`LEDGER`, none otherwise), an "about Admin's own entry" flag, whether it was reopened, closed time, resolution explanation, resolver and time, optional fix link (same types), author and timestamps. Complaints and comments MUST NOT be deletable. (§3, §4, CMP-01, CMP-02)

#### Scenario: Delete refused
- **WHEN** a `DELETE FROM complaints` is attempted
- **THEN** the database raises an error

### Requirement: Complaint visibility
A complaint with visibility `ALL` SHALL be visible to every holder of `complaint.view`; an `ADMIN` complaint MUST be visible only to its author and holders of `complaint.view.all`. For everyone else an ADMIN complaint MUST not exist: list, counts, month notes, Questioned markers, badges and search exclude it, and every endpoint for it (detail, comments, actions, its attachments) MUST respond `404 NOT_FOUND`. (§3 Visibility, Rule 8, G18, §13 "invisible to other owners")

#### Scenario: Private loan question
- **WHEN** Tanvir raises an ADMIN complaint and Farzana requests its detail
- **THEN** the response is `404 NOT_FOUND` and it is absent from her list and counts

#### Scenario: Super Admin sees all
- **WHEN** Rayhan lists complaints
- **THEN** Tanvir's ADMIN complaint is included

### Requirement: Raise a complaint
`POST /api/v1/complaints` (permission `complaint.create`) SHALL validate title ("Add a title."), body ("Tell us what's wrong in a few words (at least 10 characters)." below 10), visibility (default `ALL`), optional link and up to 5 attachment ids, then in one transaction create an OPEN complaint, link attachments, write `complaint.raised`, and queue `COMPLAINT_UPDATE` emails: `ALL` → event `NEW` to every active member except the author (opt-out honoured; title and link only, never the body); `ADMIN` → event `NEW_PRIVATE` to every active Super Admin except the author (always). The link MUST exist in the property and be visible to the author, else `422` on `link`. The "about Admin's own entry" flag SHALL be set when the linked ledger entry, loan or request belongs to an owner whose user is a Super Admin, or the linked entry's beneficiary is such an owner. Response `201` with the complaint. (C2, G7–G9, G14, Rule 7)

#### Scenario: Everyone complaint about electricity
- **WHEN** Farzana raises "September electricity bill looks high" linked to the ENTRY Electricity · Sep 2026 · 710000 paisa with visibility ALL in a house of 4 active members
- **THEN** the response is `201`, status is OPEN, the linked month is September 2026, and 3 `NEW` emails are queued without the body text

#### Scenario: Admin-only complaint
- **WHEN** Tanvir raises an ADMIN complaint
- **THEN** exactly one `NEW_PRIVATE` email per active Super Admin is queued and no owner is emailed

#### Scenario: Short description
- **WHEN** the body is "too high"
- **THEN** the response is `422` with "Tell us what's wrong in a few words (at least 10 characters)." on `body`

#### Scenario: About Admin's own loan
- **WHEN** a complaint links Rayhan's own loan and Rayhan is the Super Admin
- **THEN** the complaint is flagged as about Admin's own entry

### Requirement: List complaints
`GET /api/v1/complaints` (permission `complaint.view`) SHALL return visible complaints with `filter` = `all` (default), `open`, `in_review`, `closed` (RESOLVED, REJECTED, WITHDRAWN) or `mine` (author = viewer), optional `month` (`YYYY-MM`, linked month) and `limit` (default 50, max 200). Order MUST be OPEN (oldest first), then IN_REVIEW (oldest first), then closed (newest first). Each item SHALL carry id, title, status, visibility, reopened, author name, created date, link chip (type + label), comment count (excluding hidden), and `unseen` (the viewer takes part and has unseen comments). (C1, G11)

#### Scenario: Rayhan's list
- **WHEN** Rayhan lists all with "Shop G1 receipt missing" (OPEN, 15 Oct), "September electricity bill looks high" (IN_REVIEW, 4 Oct, 2 comments) and "Can the loan instalment be lowered?" (RESOLVED, ADMIN, 2 Sep)
- **THEN** the order is Shop G1, electricity, loan instalment

#### Scenario: Farzana's list
- **WHEN** Farzana lists all
- **THEN** only the electricity and Shop G1 complaints are returned

#### Scenario: Mine filter
- **WHEN** Nasrin filters `mine`
- **THEN** only "Shop G1 receipt missing" is returned

### Requirement: Complaint detail and thread
`GET /api/v1/complaints/{id}` (permission `complaint.view`, visibility applies) SHALL return the complaint with body, attachments, link (type, id, label, date, amount in paisa when relevant, and whether the viewer may open it), fix link, the "about Admin's own entry" flag, resolution (explanation, resolver name, time) while RESOLVED or REJECTED, the viewer's allowed actions, and a thread ordered oldest first that merges comments (author name, Admin tag when the author is a Super Admin, body, created/edited time, attachments, or for hidden comments only "Hidden by Admin: {reason}") with status lines (actor, new status, time, explanation or note) built from the audit log. A link the viewer cannot open MUST show only its type, never its details. (C3, §4 status lines)

#### Scenario: Thread order
- **WHEN** the electricity complaint has Rayhan's comment, then In review, then Tanvir's comment
- **THEN** the thread lists Rayhan's comment with the Admin tag, the "In review" status line and Tanvir's comment in that order

#### Scenario: Hidden comment body withheld
- **WHEN** a comment is hidden with reason "Personal remark"
- **THEN** every viewer receives no body and the text "Hidden by Admin: Personal remark"

### Requirement: Set status
`PATCH /api/v1/complaints/{id}/status` (permission `complaint.decide`) SHALL accept `IN_REVIEW` (optional note ≤ 2,000) from OPEN, and `RESOLVED` or `REJECTED` (explanation 1–2,000 required, else `422` "Write the explanation first — the complainant receives it.") from OPEN or IN_REVIEW, with an optional fix link on RESOLVED. Any other transition MUST respond `409 INVALID_COMPLAINT_STATUS`. The change, its audit row (`complaint.status_changed` with the note/explanation) and emails are one transaction: `IN_REVIEW` → complainant (opt-out honoured); `RESOLVED`/`REJECTED` → complainant always, and every other active member (opt-out honoured) when visibility is ALL or the complaint is about Admin's own entry; the actor is never emailed. RESOLVED/REJECTED set the closed time. Concurrent changes MUST NOT both succeed. (C4, G14, G17, Rule 10, Rule 13, CMP-02)

#### Scenario: Resolve without explanation
- **WHEN** the Super Admin resolves with an empty explanation
- **THEN** the response is `422` with "Write the explanation first — the complainant receives it."

#### Scenario: Resolve electricity complaint
- **WHEN** the Super Admin resolves the IN_REVIEW electricity complaint with an explanation
- **THEN** status is RESOLVED, the resolution is stored, Farzana and the other owners are emailed, and the entry is no longer Questioned

#### Scenario: Private resolution about Admin's own loan
- **WHEN** an ADMIN complaint about the Super Admin's own loan is resolved
- **THEN** the complainant and every other active member are emailed the resolution, and members who cannot see the complaint get no link to it

#### Scenario: Owner refused
- **WHEN** an Owner sets a status
- **THEN** the response is `403 FORBIDDEN`

#### Scenario: Closed complaint
- **WHEN** a WITHDRAWN complaint is set to IN_REVIEW
- **THEN** the response is `409 INVALID_COMPLAINT_STATUS`

### Requirement: Withdraw
`POST /api/v1/complaints/{id}/withdraw` SHALL let only the author move an OPEN or IN_REVIEW complaint to WITHDRAWN (final), set the closed time, write `complaint.withdrawn` and email active Super Admins (except the actor). Others MUST receive `403 FORBIDDEN` (or `404` when they cannot see it); closed complaints `409 INVALID_COMPLAINT_STATUS`. (C5)

#### Scenario: Withdraw removes Questioned
- **WHEN** Farzana withdraws her OPEN complaint linked to the electricity entry
- **THEN** status is WITHDRAWN and the entry is no longer Questioned

### Requirement: Reopen
`POST /api/v1/complaints/{id}/reopen` SHALL let only the author reopen a RESOLVED or REJECTED complaint once, within 14 days of its closed time, with a comment (blank → `422` "Say why it isn't resolved."). It SHALL in one transaction set status OPEN, mark it reopened, add the comment, write `complaint.reopened` and email active Super Admins. After 14 days it MUST respond `409 REOPEN_WINDOW_PASSED` ("This complaint closed more than 14 days ago — raise a new one instead."); a second reopen `409 INVALID_COMPLAINT_STATUS`. (C6, G12, Rule 11)

#### Scenario: Reopen within window
- **WHEN** Tanvir reopens his resolved complaint 3 days after it closed with "Can it be ৳4,000 then?"
- **THEN** status is OPEN with reopened true and the comment is in the thread

#### Scenario: Window passed
- **WHEN** he tries 15 days after closing
- **THEN** the response is `409 REOPEN_WINDOW_PASSED`

### Requirement: Make visible to everyone
`POST /api/v1/complaints/{id}/publish` SHALL let only the author change an ADMIN complaint to ALL, write `complaint.published` and queue `NEW` emails to active members as for a new Everyone complaint, except Super Admins (they already received `NEW_PRIVATE` when it was raised); changing ALL to ADMIN MUST NOT be possible through any endpoint. (G15, Rule 9)

#### Scenario: Made public
- **WHEN** Tanvir publishes his ADMIN complaint
- **THEN** Farzana can open it and receives a `NEW` email, and the Super Admin receives no second email

### Requirement: Comments
`POST /api/v1/complaints/{id}/comments` SHALL let any viewer of an OPEN or IN_REVIEW complaint add a comment (1–2,000 characters, up to 3 attachments) with audit `complaint.comment_added`; on a closed complaint it MUST respond `409 COMPLAINT_CLOSED`. `PATCH …/comments/{commentId}` SHALL let only the author edit the body within 15 minutes of posting while the complaint is live (else `409 EDIT_WINDOW_PASSED` "Comments can be edited for 15 minutes."), setting the edited time. `POST …/comments/{commentId}/hide` (permission `complaint.decide`, reason 1–200) SHALL hide the comment and its attachments from everyone. No endpoint deletes a comment. (C7, G8, G13, Rule 12, CMP-03)

#### Scenario: Comment on closed complaint
- **WHEN** an owner comments on a RESOLVED complaint
- **THEN** the response is `409 COMPLAINT_CLOSED`

#### Scenario: Edit after 16 minutes
- **WHEN** Tanvir edits his comment 16 minutes after posting
- **THEN** the response is `409 EDIT_WINDOW_PASSED`

#### Scenario: Owner cannot hide
- **WHEN** an Owner hides a comment
- **THEN** the response is `403 FORBIDDEN`

### Requirement: Seen comments
`POST /api/v1/complaints/{id}/seen` SHALL record that the viewer has seen the complaint's thread now. A viewer "takes part" in a complaint when they wrote it or commented on it; `unseen` is true when a visible, non-hidden comment by someone else is newer than the later of their last seen time and their own last comment. Reads MUST NOT clear `unseen`; only this call does. (C1 unread dot, §11 in-app badge)

#### Scenario: New comment marks unseen
- **WHEN** Rayhan comments on Farzana's complaint after she last saw it
- **THEN** her list shows `unseen: true` until she calls `seen`

### Requirement: Link options
`GET /api/v1/complaints/links?type={type}&q={text}` (permission `complaint.create`) SHALL return up to 20 items of that type visible to the viewer, newest first, matching `q` on their label: ENTRY (non-voided income/expense: date · category · amount), MONTH (any period), LEDGER (owner payments and advances: owner · type · date · amount), LOAN (number · owner · principal), REQUEST (requests the viewer may see: number · owner · type), SHARE_SET (share changes: effective month). Each item carries type, id, label, month and the pre-fill title "Question about {item} · {month}". `GET /api/v1/complaints/links/{type}/{id}` SHALL return one such item (for pre-fill from **Raise an objection**). (C2, G9)

#### Scenario: Search electricity
- **WHEN** Farzana searches ENTRY with "Electricity"
- **THEN** the Sep 2026 Electricity expense of 710000 paisa is returned with title "Question about Electricity · September 2026"

#### Scenario: Others' pending request not offered
- **WHEN** Farzana lists REQUEST options and Nasrin has a PENDING request
- **THEN** Nasrin's request is not returned

### Requirement: Questioned markers and month counts
`GET /api/v1/complaints/questioned?type={type}&ids={id,…}` (permission `complaint.view`, at most 200 ids) SHALL return, for each id with a visible OPEN or IN_REVIEW complaint linked to it, the newest such complaint's id. The same rule SHALL drive Questioned badges on server-rendered screens. A month's open-complaint count SHALL be the number of visible OPEN or IN_REVIEW complaints whose linked month is that month. (C8, G10, Rule 14)

#### Scenario: Questioned until closed
- **WHEN** the electricity entry has an IN_REVIEW complaint
- **THEN** `questioned` maps the entry id to that complaint, and after it is resolved the entry is absent

#### Scenario: Private complaint marks only for its viewers
- **WHEN** Tanvir's ADMIN complaint links loan L2
- **THEN** L2 is questioned for Tanvir and the Super Admin, not for Farzana

### Requirement: Open complaint count for Home
The notices provider SHALL return the number of complaints in OPEN or IN_REVIEW for the property (all visibilities) as the Home desk "Open complaints" figure. (§13 "Home's Open complaints count equals Open + In review")

#### Scenario: Two open
- **WHEN** one complaint is OPEN, one IN_REVIEW and one RESOLVED
- **THEN** the count is 2

### Requirement: Notices & complaints email opt-out
Each user SHALL have a notices & complaints email setting, on by default. When off, the user MUST NOT be queued: NORMAL notice publish/edit emails, `NEW` complaint emails, `IN_REVIEW` emails, and resolution copies sent to non-complainants. Urgent notices, reminders, `NEW_PRIVATE`, the complainant's resolution, and withdraw/reopen alerts MUST always be queued. (§11 Opt-out column)

#### Scenario: Opted-out complainant still told
- **WHEN** Farzana has the setting off and her complaint is resolved
- **THEN** she is emailed the resolution

### Requirement: Complaint audit
Every complaint raise, status change, withdraw, reopen, publish, comment add, comment edit and comment hide SHALL write one audit row (entity `complaint`), non-financial. (Rule 16)

#### Scenario: Hide audited
- **WHEN** the Super Admin hides a comment with a reason
- **THEN** one `complaint.comment_hidden` row stores the reason and the original body in `before`
