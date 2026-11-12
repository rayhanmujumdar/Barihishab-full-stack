## Why

House news ("water off Sunday", "holding tax due") and money disputes ("this bill looks high") still travel by phone and WhatsApp: nobody knows who has seen a notice, and a question about a number is never tied to that number or closed with a written answer. The Notices & Complaints PRD (`docs/notices_and_complaints_PRD.md`) gives the house a notice board with read tracking and a written, traceable complaint process linked to the exact entry, month, payment, loan, request or share change being questioned. Every section a complaint can point at now exists, and Home already reads notices and the open-complaint count through a seam (`lib/home/notices.ts`) waiting to be wired.

## What Changes

**Notices (N1–N5)**
- **Notices page** `/[lang]/notices` (main PRD S10): kicker = house name, title "Notices & complaints", **Raise a complaint** (everyone) and **+ New notice** (Super Admin); two columns on desktop (Notices · Complaints & objections), stacked on phones.
- **Notice list**: pinned first (newest first), then newest first; card tags **Urgent** / **Pinned** / **New** (unread) / "Edited"; "{date} · {n} of {m} read"; title, body clamped to 4 lines with **Read more**, attachment chips; **Mark as read**, **Mark all as read**; **Archived notices** (read-only). Super Admin ⋯ menu: Edit · Pin/Unpin · Who has read · Archive. (N1, G1)
- **New notice** dialog: title (≤ 120), message (≤ 3,000; bold, bullet list, link), priority Normal/Urgent, **Pin on everyone's dashboard** + optional **Pin until**, up to 5 attachments, reach line, **Preview**, **Publish & email**. (N2, G2–G4)
- **Edit / pin / archive**: edits show "Edited {date}" with optional **Email the change** (default on for urgent); pin/unpin any time; **Pin until** auto-unpins after the date; archive hides from the list and Home; never deleted. (N3, G1, G2)
- **Read tracking**: opening, **Read more** or **Mark as read** records a read (never undone); everyone sees "{n} of {m} read" ({m} = active members); Super Admin sees **Who has read** (Read with time / Not yet) and, for urgent notices, **Remind unread** (once per notice per day). (N4, G5, G6)
- **Home**: real pinned notices (max 3, newest first, urgent tag, unread dot, **All notices →**). (N5)

**Complaints (C1–C8)**
- **Complaint list**: filters All · Open · In review · Closed · Mine + month; Open/In review first (oldest first), then closed (newest first); card with status tag, **🔒 Admin only**, "Reopened", linked item chip, comment count, unread-comments dot. (C1, G11)
- **Raise a complaint** dialog: title (≤ 120), "What's wrong?" (10–2,000), **Linked to** searchable picker with tabs Entry · Month · Payment/Advance · Loan · Request · Share change (or "— Nothing specific —"), **Who can see it** Everyone / Admin only, up to 5 attachments; pre-filled "Question about {item} · {month}" when raised from an item. (C2, G7–G9)
- **Complaint detail** drawer (full screen on phones), deep-linkable; status/visibility tags, "About Admin's own entry", body, attachments, linked item card, **Admin's resolution** block (with **Link the fix**), thread of comments and status lines. (C3, G14)
- **Set status** (Super Admin): In review (optional note, shows "Admin is looking into it"), Resolve / Reject (explanation required). (C4, G17)
- **Withdraw** (complainant, live), **Reopen** (complainant, once, within 14 days, with a comment), **Make visible to everyone** (Admin only → Everyone, never back). (C5, C6, G12, G15)
- **Comments**: anyone who can see a live complaint; up to 3 attachments; own edit within 15 minutes ("edited"); no delete; Super Admin **Hide** with a reason. Admin-only complaints: only the complainant and Super Admin see or comment. (C7, G13, G18)
- **Questioned badges** on linked entries, months, owner payments/advances, loans, requests and share changes while Open or In review, linking back; **Raise an objection** on each of those items; "{n} open complaint(s) about {Month}" on Distribution and the Monthly report; a close-checklist warning (never a block). (C8, G9, G10)

**Shared**
- **Emails** (outbox, recipient's language, no contact or bank details): notice published / edited with "Email the change" / remind unread; new complaint (Everyone → all active members, title + link only; Admin only → Super Admin); In review → complainant; Resolved/Rejected → complainant, plus all members when Everyone or about the Admin's own entry; Withdrawn/Reopened → Super Admin. (§11)
- **Email opt-out**: one "Notices & complaints emails" toggle on `/me`; it silences only the PRD's opt-out-able emails (normal notices, new Everyone complaints, In review, resolution copies to non-complainants). Urgent notices, reminders, Admin-only complaints, the complainant's resolution and withdraw/reopen alerts always send. (§11)
- **Navigation**: Notices menu item with a badge = unread notices + complaints the viewer is part of with unseen comments; Owner bottom bar becomes Home · Accounts · Requests · Notices · More. (§11, Home PRD §4)
- **Audit**: every notice action and complaint action is an audit row (non-financial). (Rule 16)

PRD coverage: Notices & Complaints PRD §2.3 G1–G18, §3–§5, N1–N5, C1–C8, §9 rules 1–18, §10 messages, §11 (except comment emails, see below), §13 acceptance criteria; main PRD NTC-01, CMP-01, CMP-02, CMP-03, flow E, S10 (`/notices`, `/complaints/:id`), `notices` / `notice_reads` / `complaints` / `complaint_comments` (§9.4), endpoints `/notices…`, `/complaints…` (§10).

### Out of scope

- PRD "Later": N6 month-close notice template, C9 7/14-day reminders + "{n} waiting over 7 days" desk line, comment-reply emails/digest, scheduled publishing. Comments are signalled in-app only (badge + unread dot) until the digest ships.
- Phase 3: SMS/WhatsApp, family vote on a complaint, tenant notices; main PRD CMP-04 (P3).
- §15 open questions keep the PRD defaults: owners see the read **count** only; the Super Admin decides complaints about their own entries (marked, resolution emailed to all members); resolutions of Everyone complaints go to all members; 14-day reopen window; only the Super Admin posts notices; no anonymous complaints.
- Chat/real-time updates (pages refresh after each action).

## Capabilities

### New Capabilities
- `notices`: notice records, create/edit/pin/pin-until/archive, simple formatting, read tracking and counts, who-has-read, remind unread, notice emails, Home pinned-notice provider.
- `complaints`: complaint records and lifecycle (Open/In review/Resolved/Rejected/Withdrawn + reopen), visibility, linked items (6 types) and link picker, "About Admin's own entry", comments (edit window, hide), status lines, seen-tracking, Questioned lookups, month counts, complaint emails and opt-out.
- `notices-complaints-ui`: the `/notices` screen (both columns), notice dialogs, who-has-read sheet, complaint form and link picker, complaint detail drawer, `/complaints/:id` deep link, nav item + badge, Questioned badges and **Raise an objection** on Entries, Owners, Advances & Loans, Requests, Distribution and the Monthly report.

### Modified Capabilities
- `rbac`: new keys `notice.view`, `complaint.view`, `complaint.create` (Owner + Super Admin), `notice.manage`, `complaint.view.all`, `complaint.decide` (Super Admin); Owner 15 keys, Super Admin 51.
- `app-shell`: Notices item and unread badge in the sidebar; Owner bottom bar Home · Accounts · Requests · Notices · More.
- `home-dashboard`: the notices provider returns real pinned notices and the Open + In review count (seam replaced).
- `home-ui`: pinned notices block marks a notice read on **Read more** and always links **All notices →**; urgent/unread from real data.
- `attachments`: notice, complaint and comment attachments; presign for `notice.manage` / `complaint.create`; file access follows notice/complaint visibility.
- `email-outbox`: new `NOTICE` and `COMPLAINT_UPDATE` templates.
- `month-close`: new close-preview warning "{n} open complaint(s) about {Month}".
- `self-profile`: `PATCH /me` accepts the notices & complaints email toggle.

## Impact

- **DB**: one additive migration — enums `NoticePriority`, `ComplaintStatus`, `ComplaintVisibility`, `ComplaintLinkType`; tables `notices`, `notice_reads`, `complaints`, `complaint_comments`, `complaint_views`; `users.email_notices` (default true); `EmailTemplate` += `NOTICE`, `COMPLAINT_UPDATE`; no-delete triggers on notices, complaints and comments. No backfill, no change to financial tables.
- **Code**: new `lib/notices/*`, `lib/complaints/*` (pure rules + services + markup), `lib/home/notices.ts` (seam bodies), `lib/permissions.ts`, `lib/audit.ts`, `lib/api/errors.ts`, `lib/attachments/attachment-service.ts`, `lib/email/{outbox,render}.ts` + 2 templates, `lib/distribution/distribution-service.ts` + `lib/accounting/distribution.ts` (warning), `components/app/{nav.ts,ShellNav.tsx}`, `app/[lang]/(app)/layout.tsx`, Home block, entries/owners/loans/requests/distribution/reports components (badge + action), `/me` profile form, `lib/i18n/{en,bn}.ts`.
- **API**: ~20 endpoints under `/api/v1/notices…` and `/api/v1/complaints…`, all registered in `app/api/v1/openapi.ts`; `PATCH /api/v1/me` gains one field (additive).
- **Tests**: pure-module unit tests (100 %), integration API tests for every endpoint and visibility rule, component tests, Playwright `e2e/notices-complaints.spec.ts` (state-neutral) and `/notices` added to `e2e/visual.spec.ts`. All existing suites must stay green.
