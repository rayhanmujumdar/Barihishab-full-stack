# BariHisab — Notices & Complaints PRD

> Version 1.0 · Nov 11, 2026 · Author: Rayhan (dev4@awfatech.com)
> Section: Notices & Complaints (house notices from the Super Admin, complaints and objections from any member, comment threads, resolutions)
> Depends on: Authentication & roles, Home (pinned notices, open-complaint count), Income & Expenses ("Raise an objection"), Owners, Distribution, Advances & Loans, Requests, email

This document covers **features and behaviour only**. Technical design (database, API, code structure) is left to the implementation.

## Table of Contents

1. [Overview](#1-overview)
2. [Design Analysis](#2-design-analysis)
3. [Key Concepts](#3-key-concepts)
4. [Complaint Lifecycle](#4-complaint-lifecycle)
5. [Who Can Do What](#5-who-can-do-what)
6. [Features — Notices](#6-features--notices)
7. [Features — Complaints](#7-features--complaints)
8. [User Flows](#8-user-flows)
9. [Business Rules](#9-business-rules)
10. [Messages, Warnings & Empty States](#10-messages-warnings--empty-states)
11. [Notifications](#11-notifications)
12. [Worked Examples](#12-worked-examples)
13. [Acceptance Criteria](#13-acceptance-criteria)
14. [Release Phases](#14-release-phases)
15. [Open Questions](#15-open-questions)

---

## 1. Overview

This page is the house's notice board and its place for questions and disputes.

- **Notices** — one-way announcements from the Super Admin to everyone: water off on Sunday, holding tax due, a month closed. Urgent ones stand out, important ones are pinned on everyone's Home, and the Super Admin can see who has read them.
- **Complaints & objections** — any member can question an entry, a bill, a payment or a decision, in writing. Others can join the discussion, and the Super Admin must answer with a written explanation before a complaint is closed.

The aim is to move family money disputes out of phone calls and WhatsApp into a calm, written, traceable place linked to the exact numbers being questioned.

### Goals

- Important house news reaches every member and the Super Admin knows who has seen it.
- Any owner can question any number, linked to that number, without needing to call anyone.
- Every complaint ends with a written answer everyone involved can read.
- Sensitive matters can stay between the owner and the Super Admin.

### In scope

- Notice list, new notice, edit, pin/unpin, archive, read tracking, attachments
- Complaint list with filters, raise a complaint, link to an entry or month, visibility (Everyone / Admin only)
- Complaint detail with comment thread and attachments
- Status changes (In review, Resolved, Rejected) with explanation; Withdraw; Reopen
- "Raise an objection" entry points from other sections, and "Questioned" badges on linked items
- Home tie-ins (pinned notices, open complaint count), badges
- Emails and reminders

### Out of scope

- Chat or instant messaging
- SMS / WhatsApp delivery (Phase 3 channel)
- Tenant complaints (tenants don't use the app in v1)

### Success metrics

| Metric | Target |
| --- | --- |
| Urgent notices read by all active members within 48 hours | ≥ 90% |
| Complaints answered (first Admin comment or In review) within 3 days | ≥ 90% |
| Complaints closed with a written explanation | 100% |
| Complaints linked to a specific entry or month | ≥ 70% |
| Disputes raised outside the app that the family later moved into it | Falling quarter by quarter |

---

## 2. Design Analysis

What the BariHisab design shows for this page (screen S10), and what it leaves open.

### 2.1 What the design shows

**Header**

- Kicker = house name; title "Notices & complaints".
- **Raise a complaint** (secondary, everyone); **+ New notice** (primary, Super Admin).
- Two columns on desktop: **Notices** (left) and **Complaints & objections** (right); stacked on phones.

**Notice card**

- Tags: **Urgent** (yellow), **Pinned** (neutral), **New** (outline, unread by the viewer).
- "{date} · {n} of {m} read".
- Title (bold), body.
- **✓ Mark as read** (ghost button) while unread.

**New notice dialog**

- Title, Message, Priority (Normal / Urgent), checkbox "Pin on everyone's dashboard".
- Reach line: "Emails {n} active members on publish" (+ "· subject starts with [Urgent]").
- **Cancel** / **Publish & email** → "Published · emailed to {n} active members".

**Complaint card** (a button opening the detail)

- Status tag, **🔒 Admin only** tag when private.
- Title, "{name} · {date}", comment count with a speech-bubble icon.
- Empty: "No complaints. Tap 'Raise an objection' on any entry to question it."

**Raise a complaint dialog**

- Title, "What's wrong?", **Linked entry** (dropdown of recent income/expense entries, or "— Nothing specific —"), **Who can see it**: Everyone / Admin only.
- Note: "Attachments: add bill photos or screenshots after posting."
- **Cancel** / **Post complaint** → "Posted · all owners get a short email" or "Sent privately to the Admin".

**Complaint detail drawer** (right side)

- Status tag, visibility tag ("Everyone" / "Admin only"), title, "{name} · {date}".
- Body; linked entry as a button ("{date} · {category} · ৳X →"); related month line.
- **Admin's resolution** block once written.
- Comment thread: initials, name, date, **Admin** tag on the Super Admin's comments, text. "No comments yet."
- Comment box "Add a comment" + **Send** while the complaint is live.
- Super Admin block "Admin · set status": "Explanation (required to resolve or reject)", buttons **In review** · **Resolve** (primary) · **Reject**. Error: "Write the explanation first — the complainant receives it."
- Complainant: **Withdraw my complaint** (ghost).

**Entry points elsewhere**

- Income & Expenses entry detail: **Raise an objection** → complaint form pre-filled "Question about {category} · {month}", entry linked, Everyone.
- Home: Pinned notices block; Super Admin desk tile **Open complaints** (Open + In review).
- Navigation: Notices item with an unread badge; Owner bottom nav has **Notices**.

### 2.2 Sample data in the design

| Notice | Priority | Pinned | Date | Read |
| --- | --- | --- | --- | --- |
| Water tank cleaning — Sunday 26 Oct ("Supply will be off from 10 am to 2 pm…") | Urgent | Yes | 20 Oct | 2 of 4 |
| September accounts are closed ("Entitlements are posted. Payouts went out on 5 Oct…") | Normal | No | 3 Oct | 4 of 4 |
| Holding tax — next instalment due 15 Jan ("Around ৳18,500…") | Normal | Yes | 2 Oct | 2 of 4 |

| Complaint | By | Visibility | Status | Linked to | Thread |
| --- | --- | --- | --- | --- | --- |
| September electricity bill looks high ("৳7,100 for the common meter. In March it was ৳4,600…") | Farzana Haque | Everyone | In review | Electricity · September 2026 entry | Rayhan (Admin): AC in caretaker room + new stair lights, bill photo attached · Tanvir: "Confirmed — the AC was on during the heat wave…" |
| Shop G1 receipt missing for July | Nasrin Ahmed | Everyone | Open | July 2026 (month) | — |
| Can the loan instalment be lowered? (L2 ৳5,000 → ৳3,000) | Tanvir Ahmed | Admin only | Resolved | — | Resolution: "Kept at ৳5,000 so the loan clears by April 2027. You can prepay in cash at any time." |

### 2.3 Gaps found and decisions

| # | Gap in the design | Decision |
| --- | --- | --- |
| G1 | Notices can't be edited, unpinned or removed | **Edit** (shows "Edited"), **Pin / Unpin**, **Archive** (hidden from the list, kept in Archived); never deleted |
| G2 | A dated notice ("water off Sunday 26 Oct") stays pinned forever | **Pin until** date; auto-unpins after it |
| G3 | No attachments on notices (main PRD asks for them) | Up to 5 files (photo, PDF) per notice |
| G4 | Notice text is plain | Simple formatting: bold, bullet list, link; no images inside the text (use attachments) |
| G5 | Only "Mark as read"; opening doesn't count | Opening a notice (detail or "Read more") marks it read; **Mark all as read** button |
| G6 | Everyone sees "2 of 4 read" but no one sees who | Count for everyone; **who has / hasn't read** list for the Super Admin, with **Remind unread** for urgent notices |
| G7 | Complaint can be posted with an empty "What's wrong?" | Description required (10–2,000 characters) |
| G8 | "Add attachments after posting" but no way to do it | Attachments in the form (up to 5) and in comments (up to 3 each) |
| G9 | Linked entry list is only the last 40 income/expense entries | Link to any **income/expense entry**, **month**, **owner payment/advance**, **loan**, **request**, or **share change**; searchable picker; pre-filled when raised from that item |
| G10 | Linked items don't show that they're being questioned | **Questioned** badge on the linked entry/month/loan while the complaint is Open or In review, linking back |
| G11 | No filters on the complaint list | Filters: status, mine, linked month; Open + In review shown first |
| G12 | Resolved/rejected complaints can't be challenged | Complainant can **Reopen** once, within 14 days, with a comment |
| G13 | Comments can't be corrected | Edit own comment within 15 minutes ("edited"); no delete; the Super Admin can **Hide** an abusive comment with a reason ("Hidden by Admin: {reason}") |
| G14 | A complaint about the Super Admin's own entry is decided by the Super Admin | Allowed in v1, but marked "About Admin's own entry" and the resolution is emailed to all owners even if the complaint was private |
| G15 | Visibility can't change after posting | The complainant can change **Admin only → Everyone** (never back) |
| G16 | No reminder for complaints left open (main PRD: 14 days, P3) | Super Admin reminder at 7 days without a reply and at 14 days still open |
| G17 | In review needs no message, so owners don't know why it's slow | In review shows "Admin is looking into it" automatically; optional note |
| G18 | Admin-only complaints: unclear who can comment | Only the complainant and the Super Admin see and comment |

---

## 3. Key Concepts

### Notice
An announcement written by the Super Admin to all members. It has a title, message, priority (Normal / Urgent), optional pin, optional attachments, and read tracking. Notices are not discussions — there are no comments.

### Pinned
A pinned notice appears in **Pinned notices** on everyone's Home (up to 3, newest first) until it is unpinned or its **Pin until** date passes.

### Complaint (objection)
A written question or concern from any member, optionally linked to the thing being questioned. It has a status, a visibility, a comment thread and, at the end, the Super Admin's written explanation.

### Visibility
- **Everyone** — all logged-in members can read and comment.
- **Admin only** — only the complainant and the Super Admin can see it. Others don't see it exists.

### Linked item
The entry, month, payment, loan, request or share change a complaint is about. The complaint shows a link to it; the item shows a **Questioned** badge back to the complaint while it is unresolved.

---

## 4. Complaint Lifecycle

| Status | Meaning | Tag | Who moves it | Next |
| --- | --- | --- | --- | --- |
| **Open** | Just raised | Outline | — | In review, Resolved, Rejected, Withdrawn |
| **In review** | The Super Admin is looking into it | Yellow | Super Admin | Resolved, Rejected, Withdrawn |
| **Resolved** | Answered/fixed, with explanation | Green tick + word | Super Admin (explanation required) | Reopened (by complainant, once, 14 days) |
| **Rejected** | Not accepted, with explanation | Neutral | Super Admin (explanation required) | Reopened (by complainant, once, 14 days) |
| **Withdrawn** | Taken back by the complainant | Neutral | Complainant | — (final) |
| **Reopened** → back to **Open** | Complainant isn't satisfied | Outline + "Reopened" | Complainant (comment required) | as Open |

Closed complaints (Resolved, Rejected, Withdrawn) are read-only. Every status change is a line in the thread ("Rayhan set this to In review · 4 Oct").

---

## 5. Who Can Do What

| Feature | Super Admin | Owner |
| --- | --- | --- |
| Read notices, see read count | ✓ | ✓ |
| See who has / hasn't read a notice | ✓ | ✗ |
| Create, edit, pin/unpin, archive notices | ✓ | ✗ |
| Remind unread members (urgent notices) | ✓ | ✗ |
| Mark notices read | ✓ | ✓ |
| Raise a complaint (Everyone or Admin only) | ✓ | ✓ |
| See Everyone complaints | ✓ | ✓ |
| See Admin-only complaints | ✓ (all) | Own only |
| Comment on a live complaint they can see | ✓ | ✓ |
| Edit own comment (15 min) | ✓ | ✓ |
| Hide a comment (with reason) | ✓ | ✗ |
| Set In review / Resolve / Reject | ✓ | ✗ |
| Withdraw, reopen, make public | Own only | Own only |

Every action is checked again on the server, whatever the screen shows.

---

## 6. Features — Notices

### N1 · Notice list — Core

- Left column (desktop) or first section (phone), titled "Notices".
- Order: pinned first (newest first), then the rest newest first.
- Card: tags (**Urgent**, **Pinned**, **New**, "Edited"), "{date} · {n} of {m} read", title, message (first 4 lines + **Read more**), attachment chips.
- **Mark as read** while unread; **Mark all as read** at the top when anything is unread.
- **Archived notices** link at the bottom (archived ones are read-only).
- Super Admin ⋯ menu on each card: Edit · Pin / Unpin · Who has read · Archive.

### N2 · New notice — Core (Super Admin)

- Fields:
  - **Title** (required, ≤ 120 characters)
  - **Message** (required, ≤ 3,000 characters; bold, bullet list, link)
  - **Priority**: Normal / Urgent
  - **Pin on everyone's dashboard** + optional **Pin until** date
  - **Attachments** (up to 5, JPG/PNG/WebP/PDF, 5 MB each)
- Reach line: "Emails {n} active members on publish" (+ "· subject starts with [Urgent]"); invited members who haven't joined yet and deactivated members are not emailed.
- **Preview** shows the card as members will see it.
- **Publish & email** → toast "Published · emailed to {n} active members"; the Super Admin's own read is recorded.

### N3 · Edit, pin and archive — Core (Super Admin)

- **Edit** title, message, attachments, priority; the card shows "Edited {date}". Option **Email the change** (off by default; on for urgent notices).
- **Pin / Unpin** at any time; **Pin until** auto-unpins after the date.
- **Archive** removes it from the list and Home; it stays under Archived notices. Notices are never deleted.

### N4 · Read tracking — Core

- A notice counts as read for a member when they open it, tap **Read more**, or tap **Mark as read**.
- Everyone sees "{n} of {m} read" ({m} = active members).
- Super Admin: **Who has read** shows two lists — Read (with time) / Not yet.
- Urgent notices: **Remind unread** sends one reminder email to those who haven't read (once per notice per day).

### N5 · Pinned notices on Home — Core

- Home shows up to 3 pinned notices (newest first) with urgent tags and unread dots; **All notices →** opens this page.
- Unpinned or expired notices leave Home at once.

### N6 · Monthly close notice — Later

- When a month closes, the Super Admin is offered a ready-made notice: "{Month} accounts are closed. Entitlements are posted; payouts follow." (editable before publishing).

---

## 7. Features — Complaints

### C1 · Complaint list — Core

- Right column (desktop) or second section (phone), titled "Complaints & objections".
- Filters: **All · Open · In review · Closed · Mine**; optional month filter.
- Order: Open and In review first (oldest first, so nothing waits too long), then closed (newest first).
- Card: status tag, **🔒 Admin only** tag, "Reopened" tag, title, "{name} · {date}", linked item chip ("Electricity · Sep 2026"), comment count, unread-comments dot.
- Tap → complaint detail.

### C2 · Raise a complaint — Core

- From **Raise a complaint** here, or **Raise an objection** on an entry, month, owner payment, loan or request (pre-filled).
- Fields:
  - **Title** (required, ≤ 120 characters; pre-filled "Question about {item} · {month}" when raised from an item)
  - **What's wrong?** (required, 10–2,000 characters)
  - **Linked to** (optional): searchable picker with tabs — Entry · Month · Payment/Advance · Loan · Request · Share change; "— Nothing specific —"
  - **Who can see it**: Everyone (default) / Admin only, with the help line "Admin only: just you and the Admin."
  - **Attachments** (up to 5)
- **Post complaint** → Everyone: "Posted · all owners get a short email"; Admin only: "Sent privately to the Admin".
- The linked item gets a **Questioned** badge.

### C3 · Complaint detail — Core

- Opens as a right drawer (full screen on phones).
- Header: status tag, visibility tag, "About Admin's own entry" note when relevant, title, "{name} · {date}", close ✕.
- Body text and attachments.
- **Linked item** card (date · type · amount) → opens it.
- **Admin's resolution** block (once Resolved/Rejected), with who and when.
- **Thread**: comments oldest first; each with initials, name, date, **Admin** tag, "edited", attachments; status changes as small system lines.
- **Comment box** (live complaints only): text, attach (up to 3), **Send**.
- Complainant actions: **Withdraw my complaint** (live), **Make visible to everyone** (Admin-only complaints), **Reopen** (within 14 days of closing, once).
- Super Admin block "Admin · set status" (see C4).

### C4 · Set status — Core (Super Admin)

- Buttons: **In review** · **Resolve** (primary) · **Reject**.
- **Explanation** is required for Resolve and Reject ("Write the explanation first — the complainant receives it."); optional for In review.
- Resolve can include **Link the fix** (e.g. the corrected entry or an adjustment) shown in the resolution block.
- Status line added to the thread; toast "Status updated · {status}".

### C5 · Withdraw — Core

- Complainant only, while Open or In review; confirmation "Withdraw this complaint? It closes and stays visible as Withdrawn."
- The Questioned badge is removed from the linked item.

### C6 · Reopen — Core

- Complainant only, once, within 14 days after Resolved or Rejected.
- Requires a comment ("Why isn't this resolved?").
- Status back to Open with a **Reopened** tag; the Super Admin is told.

### C7 · Comments — Core

- Anyone who can see a live complaint can comment.
- Own comment editable for 15 minutes ("edited").
- No deleting. The Super Admin can **Hide** a comment with a reason; it shows "Hidden by Admin: {reason}" to everyone.
- Closed complaints can't get new comments (Reopen first).

### C8 · Questioned badges — Core

- Linked items (entries, months, payments, loans, requests, share changes) show a small **Questioned** badge while the complaint is Open or In review; tap → the complaint.
- On a month's Distribution page and in reports, a note: "{n} open complaint(s) about {Month}."
- The Close month checklist shows a warning (not a block) when the month has open complaints.

### C9 · Reminders — Later

- Super Admin: reminder when a complaint has no Admin reply after 7 days, and when it is still Open/In review after 14 days.
- Home desk tile **Open complaints** shows the count, with "{n} waiting over 7 days" in red.

---

## 8. User Flows

### 8.1 Super Admin posts an urgent notice

1. **+ New notice** → title "Water tank cleaning — Sunday 26 Oct", message, **Urgent**, pinned until 26 Oct.
2. Reach line: "Emails 4 active members on publish · subject starts with [Urgent]".
3. **Publish & email** → appears pinned on everyone's Home.
4. Two days later, "2 of 4 read" → **Who has read** → **Remind unread**.
5. On 27 Oct it unpins itself.

### 8.2 Owner questions a bill

1. Farzana opens September's Electricity entry (৳7,100) → **Raise an objection**.
2. Form pre-filled "Question about Electricity · September 2026", linked; she writes "In March it was ৳4,600. Was the reading checked?" → Everyone → **Post complaint**.
3. All owners get a short email; the entry shows **Questioned**.
4. Rayhan sets **In review**, comments with the reason and points to the bill photo; Tanvir adds a comment confirming.
5. Rayhan **Resolves**: "Higher use from the caretaker AC during the heat wave and new stair lights; bill checked against the meter photo." The badge disappears.

### 8.3 Private matter

1. Tanvir asks to lower his loan instalment → **Admin only**.
2. Only he and Rayhan see it.
3. Rayhan **Resolves**: "Kept at ৳5,000 so the loan clears by April 2027. You can prepay in cash at any time."
4. Tanvir isn't satisfied → **Reopen** with a comment within 14 days; status back to Open.

### 8.4 Missing receipt

1. Nasrin raises "Shop G1 receipt missing for July", linked to **July 2026** (month).
2. Rayhan attaches the receipt to the July rent entry, comments, and **Resolves** with **Link the fix** pointing to that entry.

---

## 9. Business Rules

### Notices
1. Only the Super Admin creates, edits, pins and archives notices.
2. Notices have no comments; questions go to complaints.
3. Publishing emails all **active** members; urgent subjects start with "[Urgent]".
4. A notice is read for a member once they open it or mark it read; reads are never undone.
5. Notices are never deleted, only archived; edits show "Edited".
6. Pinned notices appear on Home (max 3); **Pin until** unpins automatically after that date.

### Complaints
7. Any active member can raise a complaint; title and description are required.
8. Everyone-complaints are visible to all members; Admin-only complaints to the complainant and the Super Admin only.
9. Visibility can only change from Admin only to Everyone, by the complainant.
10. Only the Super Admin changes status; Resolve and Reject need a written explanation.
11. Closed complaints are read-only; the complainant can reopen once within 14 days with a comment.
12. Comments: edit own within 15 minutes; never delete; the Super Admin may hide one with a visible reason.
13. A complaint about the Super Admin's own entry is marked so, and its resolution is emailed to all owners.
14. Linked items show a Questioned badge while the complaint is Open or In review.
15. Open complaints about a month warn (never block) the month close.
16. Every notice action and complaint status change is in the Audit Log (non-financial).
17. Attachments: JPG, PNG, WebP, PDF; 5 MB each; visible to whoever can see the notice or complaint.
18. Text shows in the language it was written; the app's labels follow each viewer's language.

---

## 10. Messages, Warnings & Empty States

| Situation | Message |
| --- | --- |
| Notice without title | "Add a title." |
| Notice without message | "Write the message." |
| Notice reach line | "Emails {n} active members on publish" (+ "· subject starts with [Urgent]") |
| Notice published | "Published · emailed to {n} active members" |
| Notice archived | "Archived · removed from everyone's list and Home" |
| Reminder sent | "Reminder sent to {n} members who haven't read it" |
| Complaint without title | "Add a title." |
| Complaint description too short | "Tell us what's wrong in a few words (at least 10 characters)." |
| Posted to everyone | "Posted · all owners get a short email" |
| Posted privately | "Sent privately to the Admin" |
| Resolve/Reject without explanation | "Write the explanation first — the complainant receives it." |
| Status changed | "Status updated · {status}" |
| Withdraw confirm | "Withdraw this complaint? It closes and stays visible as Withdrawn." |
| Reopen without comment | "Say why it isn't resolved." |
| Reopen window passed | "This complaint closed more than 14 days ago — raise a new one instead." |
| Comment edit window passed | "Comments can be edited for 15 minutes." |
| No notices | "No notices yet." (+ **New notice** for the Super Admin) |
| No complaints | "No complaints. Tap 'Raise an objection' on any entry to question it." |
| No comments | "No comments yet." |
| Filter empty | "No complaints match this filter." |
| Month close with open complaints | ⚠ "{n} open complaint(s) about {Month}." |

---

## 11. Notifications

| Event | Who is told | Opt-out |
| --- | --- | --- |
| Notice published | All active members (full text; "[Urgent]" in the subject when urgent) | Urgent: no · Normal: yes |
| Notice edited with "Email the change" | All active members | Same as above |
| Remind unread (urgent) | Members who haven't read it | No |
| New complaint — Everyone | All active owners (title + link, no full text) | Yes |
| New complaint — Admin only | Super Admin | No |
| New comment | Complainant + everyone who has commented (not the writer) | Yes |
| Status → In review | Complainant | Yes |
| Resolved / Rejected | Complainant; all owners too when visibility is Everyone or it concerns the Admin's own entry | No for complainant |
| Withdrawn / Reopened | Super Admin | No |
| No Admin reply in 7 days / still open at 14 days | Super Admin | No |

In-app: a badge on **Notices** in the menu for unread notices and new comments on complaints the viewer is part of. Emails are in each person's language and never include other owners' contact details or bank details.

---

## 12. Worked Examples

From the design's sample data.

### 12.1 Notice list as Nasrin sees it (22 Oct)

| Order | Tags | Title | Read line |
| --- | --- | --- | --- |
| 1 | Urgent · Pinned · New | Water tank cleaning — Sunday 26 Oct | 20 Oct · 2 of 4 read |
| 2 | Pinned | Holding tax — next instalment due 15 Jan | 2 Oct · 2 of 4 read |
| 3 | — | September accounts are closed | 3 Oct · 4 of 4 read |

With **Pin until 26 Oct**, the water-tank notice leaves everyone's Home on 27 Oct.

### 12.2 Complaint "September electricity bill looks high"

| When | Who | What |
| --- | --- | --- |
| 4 Oct | Farzana Haque | Raised (Everyone), linked to Electricity · Sep 2026 · ৳7,100: "In March it was ৳4,600. Was the reading checked?" |
| 4 Oct | — | Electricity entry shows **Questioned** |
| 4 Oct | Rayhan Ahmed (Admin) | "Caretaker room AC ran most of September, plus the new stair lights. Bill photo is attached on the entry." |
| 4 Oct | — | Status → **In review** |
| 5 Oct | Tanvir Ahmed | "Confirmed — the AC was on during the heat wave. We should put it on a timer." |
| next | Rayhan Ahmed (Admin) | **Resolve** with explanation → Farzana and all owners emailed; badge removed |

### 12.3 Complaint list as Rayhan (Super Admin) sees it

1. **Open** — Shop G1 receipt missing for July — Nasrin · 15 Oct · 0 comments
2. **In review** — September electricity bill looks high — Farzana · 4 Oct · 2 comments
3. **Resolved · 🔒 Admin only** — Can the loan instalment be lowered? — Tanvir · 2 Sep

Home desk tile **Open complaints: 2**. Farzana and Nasrin see items 1 and 2 only; Tanvir sees all three.

---

## 13. Acceptance Criteria

### Notices
- [ ] Only the Super Admin sees New notice, Edit, Pin, Archive and Who has read
- [ ] Publishing emails all active members; urgent subjects start with [Urgent]
- [ ] Opening or marking a notice records it as read; counts update everywhere
- [ ] Pinned notices appear on Home (max 3) and unpin after their Pin until date
- [ ] Edited notices show "Edited"; archived notices disappear from the list and Home but stay in Archived
- [ ] Remind unread emails only members who haven't read it

### Complaints
- [ ] Any member can post a complaint with title and description, optionally linked and with attachments
- [ ] Raising from an entry pre-fills the title and link; the entry shows Questioned until closed
- [ ] Admin-only complaints are invisible to other owners (list, counts, badges, search)
- [ ] Only the Super Admin can change status; Resolve/Reject without explanation is refused
- [ ] Complainant can withdraw while live, reopen once within 14 days, and make a private complaint public
- [ ] Closed complaints accept no comments; comments can be edited for 15 minutes only
- [ ] Open complaints about a month show as a warning in that month's close checklist
- [ ] Home's Open complaints count equals Open + In review complaints

### General
- [ ] Every action is in the Audit Log
- [ ] Emails follow section 11, in each person's language
- [ ] Works at 360px width (columns stack; drawer full screen), in বাংলা and English

---

## 14. Release Phases

The main BariHisab plan places this module in Phase 2 (Transparency & Notifications). Within this module:

| Release | Features |
| --- | --- |
| **Core (build now)** | N1 Notice list · N2 New notice · N3 Edit/pin/archive · N4 Read tracking · N5 Pinned on Home · C1 Complaint list · C2 Raise a complaint · C3 Detail · C4 Set status · C5 Withdraw · C6 Reopen · C7 Comments · C8 Questioned badges · publish/complaint/resolution emails |
| **Later** | N6 Month-close notice template · C9 Reminders · comment-reply emails with digest · notice scheduling (publish at a future time) |
| **Phase 3** | SMS / WhatsApp for urgent notices · family vote on a disputed complaint · tenant notices |

---

## 15. Open Questions

- [ ] Should owners be able to see **who** has read a notice, or only the count?
- [ ] For complaints about the Super Admin's own entries, should another owner (e.g. the eldest) decide instead?
- [ ] Should a resolved Everyone-complaint's resolution always be emailed to all owners, or only to those who commented?
- [ ] Is 14 days the right window to reopen?
- [ ] Should owners be allowed to post notices (e.g. "I'll be away in December")?
- [ ] Should complaints be allowed to be anonymous to other owners (but not to the Admin)?