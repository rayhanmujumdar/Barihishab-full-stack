# notices-complaints-ui Specification

## Purpose

The Notices & complaints screen and its dialogs and drawer, the navigation entry and badge, and the Questioned badges and Raise-an-objection entry points that tie complaints to entries, months, payments, loans, requests and share changes across the app.

## Requirements

### Requirement: Notices screen and routes
`/[lang]/notices` (permission `notice.view`) SHALL render, server-side, the house name as kicker, title "Notices & complaints", **Raise a complaint** (secondary, `complaint.create`) and **+ New notice** (primary, `notice.manage` only), and two columns ≥ 860px — **Notices** left, **Complaints & objections** right — stacked (notices first) below 860px. Search params SHALL drive state: `notice={id}` scrolls to, expands and marks that notice read; `archived=1` shows Archived notices; `new=1` opens New notice (Super Admin); `complaint={id}` opens the complaint drawer; `raise=1` with optional `link={TYPE}:{id}` opens the complaint form pre-filled; `filter` and `month` filter complaints. `/[lang]/complaints/{id}` SHALL redirect to `/[lang]/notices?complaint={id}`. (§2.1 Header, S10)

#### Scenario: Owner header
- **WHEN** an Owner opens `/en/notices`
- **THEN** **Raise a complaint** shows and **+ New notice** does not

#### Scenario: Email deep link
- **WHEN** a member opens `/en/complaints/{id}` for a complaint they can see
- **THEN** they land on `/en/notices?complaint={id}` with the drawer open

### Requirement: Notice cards
Each notice card SHALL show tags **Urgent** (yellow), **Pinned** (neutral), **New** (outline, unread by the viewer) and "Edited {date}"; "{date} · {n} of {m} read"; bold title; formatted body clamped to 4 lines with **Read more** (expanding marks it read); attachment chips opening the file viewer; **✓ Mark as read** while unread. **Mark all as read** SHALL show at the top while anything is unread, and an **Archived notices** link at the bottom. For `notice.manage` a ⋯ menu SHALL offer Edit · Pin/Unpin · Who has read · Archive (Archive asks for confirmation: "Archived · removed from everyone's list and Home" toast). Empty: "No notices yet." plus **New notice** for the Super Admin. Archived view is read-only. (N1, N4, G1, G5, §10)

#### Scenario: Mark as read updates count
- **WHEN** Nasrin taps **Mark as read** on "Water tank cleaning"
- **THEN** the New tag disappears, the line reads "2 of 4 read" → "3 of 4 read" after refresh, and her nav badge decreases

#### Scenario: Owner has no menu
- **WHEN** an Owner views a notice card
- **THEN** no ⋯ menu is rendered

### Requirement: New and edit notice dialog
The dialog (full screen on phones) SHALL have Title, Message (with a short formatting hint: **bold**, "- " bullets, [text](link)), Priority Normal/Urgent, "Pin on everyone's dashboard" with optional **Pin until** date, up to 5 attachments, the reach line "Emails {n} active members on publish" (+ "· subject starts with [Urgent]" when urgent), **Preview** rendering the card as members will see it, and **Cancel** / **Publish & email** (toast "Published · emailed to {n} active members"). In edit mode the button is **Save** with an **Email the change** checkbox, off by default and on when Urgent. Field errors show inline ("Add a title.", "Write the message."). (N2, N3, §2.1 New notice dialog)

#### Scenario: Urgent reach line
- **WHEN** the Super Admin picks Urgent in a house of 4 active members
- **THEN** the reach line reads "Emails 4 active members on publish · subject starts with [Urgent]"

### Requirement: Who has read sheet
**Who has read** SHALL open a sheet with "Read" (name, time) and "Not yet" (name) lists and, for urgent non-archived notices, **Remind unread** (toast "Reminder sent to {n} members who haven't read it"; disabled with a note once sent today). (N4, G6)

#### Scenario: Remind
- **WHEN** the Super Admin taps **Remind unread** with 2 unread members
- **THEN** the toast reads "Reminder sent to 2 members who haven't read it"

### Requirement: Complaint list column
The complaints column SHALL show filter chips All · Open · In review · Closed · Mine and a month filter; cards (buttons opening the drawer) with status tag (Open outline, In review yellow, Resolved green tick + word, Rejected/Withdrawn neutral), **🔒 Admin only**, "Reopened", title, "{name} · {date}", linked item chip, comment count with a speech-bubble icon and an unread dot when `unseen`. Empty: "No complaints. Tap 'Raise an objection' on any entry to question it."; filtered empty: "No complaints match this filter." (C1, §4 Tag, §10)

#### Scenario: Filter empty
- **WHEN** a member filters In review and none exist
- **THEN** "No complaints match this filter." is shown

### Requirement: Raise a complaint dialog
The dialog (full screen on phones) SHALL have Title, "What's wrong?", **Linked to** — a searchable picker (debounced) with tabs Entry · Month · Payment/Advance · Loan · Request · Share change and "— Nothing specific —" — **Who can see it** Everyone (default) / Admin only with the help line "Admin only: just you and the Admin.", up to 5 attachments, and **Cancel** / **Post complaint**. Picking an item while the title is empty fills "Question about {item} · {month}". Success toasts: "Posted · all owners get a short email" (Everyone) or "Sent privately to the Admin" (Admin only); the new complaint's drawer opens. (C2, G8, G9, §10)

#### Scenario: Private toast
- **WHEN** Tanvir posts with Admin only
- **THEN** the toast reads "Sent privately to the Admin"

### Requirement: Complaint drawer
The drawer (right side; full screen below 860px) SHALL show status tag, visibility tag ("Everyone" / "🔒 Admin only"), "About Admin's own entry" note when flagged, title, "{name} · {date}", close ✕; body and attachments; the linked item card ("{date} · {type} · ৳X →") opening that item (type only when the viewer cannot open it); "Admin is looking into it" while IN_REVIEW; the **Admin's resolution** block with who, when and the fix link once RESOLVED/REJECTED; the thread (initials, name, date, **Admin** tag, "edited", attachments, hidden text, small status lines; "No comments yet."); the comment box (live only; text, up to 3 attachments, **Send**); own comments show **Edit** for 15 minutes; Super Admin sees **Hide** per comment (reason dialog). Complainant actions: **Withdraw my complaint** (live; confirmation "Withdraw this complaint? It closes and stays visible as Withdrawn."), **Make visible to everyone** (Admin-only; confirmation), **Reopen** (closed RESOLVED/REJECTED within 14 days, once; requires a comment, error "Say why it isn't resolved."). Super Admin block "Admin · set status": Explanation ("required to resolve or reject"), optional **Link the fix** picker, buttons **In review** · **Resolve** (primary) · **Reject**; empty explanation shows "Write the explanation first — the complainant receives it."; success toast "Status updated · {status}". Opening the drawer SHALL call the seen endpoint when the viewer has unseen comments. (C3–C7, G13, G15, G17, §10)

#### Scenario: Resolve needs explanation
- **WHEN** the Super Admin taps **Resolve** with an empty explanation
- **THEN** the field shows "Write the explanation first — the complainant receives it." and nothing is sent

#### Scenario: Closed complaint read-only
- **WHEN** a member opens a RESOLVED complaint
- **THEN** there is no comment box and the resolution block shows the explanation

### Requirement: Navigation item and badge
The menu SHALL include **Notices** (`/notices`, permission `notice.view`) after Requests, with a square yellow badge = unread non-archived notices + complaints the viewer takes part in with unseen comments, hidden at 0. (§2.1 Entry points, §11 In-app)

#### Scenario: Badge count
- **WHEN** Nasrin has 2 unread notices and 1 complaint with unseen comments
- **THEN** the Notices badge shows 3

### Requirement: Questioned badges and Raise an objection
Linked items SHALL show a small **Questioned** badge linking to the complaint while a visible complaint about them is OPEN or IN_REVIEW, and offer **Raise an objection** (opening `/notices?raise=1&link={TYPE}:{id}`, form pre-filled, visibility Everyone) to `complaint.create` holders: income/expense rows and the entry detail drawer (ENTRY); the Distribution page header (MONTH); owner statement rows for payments and advances (LEDGER); the loan detail sheet (LOAN); the request detail sheet (REQUEST); the share timeline entries (SHARE_SET). The Distribution page and the Monthly report SHALL show "{n} open complaint(s) about {Month}." linking to the filtered complaint list when n > 0. (C8, G9, G10, §2.1 Entry points, flow E)

#### Scenario: Objection from an entry
- **WHEN** Farzana opens September's Electricity entry and taps **Raise an objection**
- **THEN** the complaint form opens titled "Question about Electricity · September 2026", linked to that entry, visibility Everyone

#### Scenario: Badge on the entry
- **WHEN** her complaint is posted
- **THEN** the Electricity row and detail show **Questioned**, which opens the complaint

#### Scenario: Month note
- **WHEN** July 2026 has one open complaint visible to the viewer
- **THEN** July's Distribution page shows "1 open complaint about July 2026."

### Requirement: Language, width and design
The screen, dialogs and drawer SHALL follow the BariHisab design system (ink on paper, zero radius, one yellow signal, heroicons only), work at 360px without horizontal scroll (columns stack, drawer full screen), and render all labels in বাংলা and English with Bangla digits; user-written text is shown as written. Loading SHALL use the shared skeleton primitives. (§13 General, Rule 18)

#### Scenario: Bangla at 360px
- **WHEN** a member opens `/bn/notices` at 360px
- **THEN** labels are Bangla, dates and counts use Bangla digits, and the page has no horizontal scroll
