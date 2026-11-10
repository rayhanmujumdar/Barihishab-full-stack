## Purpose

The Requests screen and its dialogs, plus the navigation, Home and "From request" tie-ins, so owners can ask for money and the Super Admin can decide and pay out from one place on desktop and 360px phones.

## ADDED Requirements

### Requirement: Navigation and badge
The app shell SHALL show a **Requests** item (`/[lang]/requests`) in the sidebar and bottom nav for users with `request.view`. Its badge SHALL show the count of PENDING requests for users with `request.view.all`, and for other users the count of their own requests with an unseen decision; no badge when 0. Counts use Bangla digits in বাংলা. (F1, F14)

#### Scenario: Super Admin badge
- **WHEN** two requests are PENDING and the Super Admin opens any page
- **THEN** the Requests nav item shows badge "2"

#### Scenario: Owner badge clears
- **WHEN** an owner's request was approved and they open Requests
- **THEN** the screen marks the decision seen (`POST /requests/seen`) and the badge disappears

### Requirement: Requests page layout
`/[lang]/requests` SHALL show the kicker "Advance · loan · special grant", title "Requests" and **+ Request money**, then one tab bar (`?tab=` in the URL, active tab yellow) with one section per tab. With `request.view.all` the tabs SHALL be **Needs your decision** (default; count of pending; overdue first; empty: "No requests waiting. Owners' new requests land here and you get an email."), **Approved · awaiting cash** (count; empty: "Nothing approved is waiting for cash.") and **History** (owner, type, status and year filters kept in the URL and a **Show older** button when more exist). Without it the tabs SHALL be **My requests** (default; count of unseen decisions; empty: "No requests yet." + **Request money**) and **Paid out to owners** (empty: "Nothing has been paid out through requests yet."). A ⋯ menu SHALL offer **Record request for…** with `request.record`. (F1, F11, F12, §9)

#### Scenario: Owner view
- **WHEN** an Owner with no requests opens the page
- **THEN** they see the tabs My requests (current) and Paid out to owners, "No requests yet." with a **Request money** button, and no decision queue or History filters

#### Scenario: Super Admin tabs
- **WHEN** one request is pending and one approved
- **THEN** the tabs read Needs your decision 1 · Approved · awaiting cash 1 · History, and only the current tab's section is shown

#### Scenario: Super Admin with nothing pending
- **WHEN** no request is PENDING
- **THEN** the decision section shows "No requests waiting. Owners' new requests land here and you get an email."

### Requirement: Request card
Each card SHALL show the status tag (Pending outline; Approved · awaiting cash yellow; Disbursed, Rejected, Cancelled, Withdrawn neutral), Overdue / Self-approved / "Recorded by {Admin}" tags, the number, "Asked {date} · Needed by {date}", "{Owner} · {type}", the quoted reason, "Admin: {note}" when decided with a note, the requested amount and "Approved ৳X" when lower, and "Entry voided" when the linked entry was voided. Actions: **Disburse · posts an advance** / **Disburse · opens a loan** / **Disburse · books an expense** and **Withdraw approval** (APPROVED, `request.disburse`/`request.decide`); **Edit** (requester, PENDING); **Cancel request** (requester, PENDING or APPROVED). Tapping a card opens the detail sheet. Money uses ৳ with lakh grouping, Bangla digits in বাংলা. (§2.1, F3, F7, F8, Rule 16)

#### Scenario: Approved lower
- **WHEN** Tanvir's 800000 request was approved at 600000 with a note
- **THEN** his card shows "Approved · awaiting cash", ৳8,000, "Approved ৳6,000" and "Admin: Reduced — bank balance is low until rent clears"

#### Scenario: Owner never sees decision buttons
- **WHEN** an Owner views any card
- **THEN** no Approve, Reject, Withdraw or Disburse button is rendered

### Requirement: Request money dialog
**+ Request money** SHALL open a dialog (full screen below 640px) with a type segment Advance (default) · Loan · Special grant and the PRD help text for each, "Your balance now: ৳X" (coloured and labelled), Amount (৳), "What is it for?" (hint: other owners may see it once paid), Needed by (themed date picker, default today + 7 days, earlier dates disabled), Repayment plan (Loan only, hint "৳4,000 per month from entitlement") and up to 3 attachments each with a Private toggle. Live hints from form context: advance limit and used with a soft over-limit warning; owed-money hint "You're owed ৳X — ask the Admin for a payout instead, or request only the extra."; "You have L{n} with ৳X left."; grant "This is shared by everyone — about ৳X less for each 10% share."; "You already have a pending request (R-…)." **Submit request** shows toast "Request sent · the Admin has been emailed". The same dialog edits a PENDING request (listing its current files with a remove button each) and, from **Record request for…**, first asks for the owner. Field errors use the PRD §9 messages. (F2, F3, F11, F15, G5, G11, G12)

#### Scenario: Submit an advance
- **WHEN** Nasrin fills ৳10,000, a reason and needed-by 30 Oct and submits
- **THEN** the dialog closes, the toast "Request sent · the Admin has been emailed" shows and the card R-2026-… appears under My requests as Pending

#### Scenario: Repayment plan only for loans
- **WHEN** the type is Advance
- **THEN** the Repayment plan field is not shown

### Requirement: Decision card
Each PENDING request in **Needs your decision** SHALL show the card content plus a context panel — **Their balance** (coloured), **Loan outstanding**, **Advance limit**, **House fund** — and the type-specific context: Advance limit before/after and red "Above the advance limit — allowed, but flagged." when over; Loan active loans and whether the plan finishes within 24 months; Grant "Distributable for {month} drops by about ৳X; each owner's share drops by their %." with a per-owner list. Warnings: other pending request, amount above the House Fund. The Super Admin's own request shows "Your own request". Actions **Approve** (primary) and **Reject** (secondary). (F4, F10)

#### Scenario: Over the limit
- **WHEN** an Advance would take the owner above their limit
- **THEN** the card shows "Above the advance limit — allowed, but flagged." and Approve stays enabled

### Requirement: Approve, reject and withdraw dialogs
**Approve** SHALL open "{Owner} asked for ৳X ({type}). You may approve a lower amount." (plus "This is your own request — it is tagged 'Self-approved' and every owner is emailed." for self-requests) with Approved amount (default requested), Note to requester (required when lower), **Approve and disburse now** option, **Cancel** / **Approve**; success toast "Approved · requester emailed", and with the option the Disburse dialog opens next. **Reject** SHALL open "Reject this request? {Owner} is emailed with your reason." with a required reason → **Reject request**, toast "Request rejected · requester emailed". **Withdraw approval** SHALL ask for a required reason, toast "Approval withdrawn · requester emailed". **Cancel request** SHALL confirm "Cancel R-…? The Admin is told." first (destructive confirm), toast "Request cancelled". (F3, F5, F6, F8)

#### Scenario: Approve lower without note
- **WHEN** the amount is lowered and the note left empty
- **THEN** the dialog shows "Explain why the amount is lower." and does not submit

#### Scenario: Approve and disburse now
- **WHEN** Approve is submitted with "Approve and disburse now" ticked
- **THEN** the Disburse dialog for the same request opens with the approved amount

### Requirement: Disburse dialog
The Disburse dialog SHALL show the approved amount read-only, Date (default today), Fund account with its balance, Method (Cash / Bank / bKash / Nagad), Reference no. (required except Cash), for loans Monthly instalment (pre-filled from the plan's number, can be cleared to "Manual"), and for grants the booking month and "Every owner will be emailed." It SHALL warn "This is more than {fund account} holds (৳X)." when the amount exceeds the selected fund. With no open month the Disburse buttons SHALL be disabled with "Open a month first — payouts are recorded in an open month." Success toast: "Disbursed · entry created · all owners emailed". (F7, G1, G13)

#### Scenario: No open month
- **WHEN** every month is closed
- **THEN** Disburse buttons are disabled and show the open-a-month message

### Requirement: Detail sheet and timeline
Tapping a card SHALL open a sheet (`?request={id}` in the URL) with all visible fields, attachments in the existing gallery/lightbox (Private files marked), the linked entry with a link ("Advance on {Owner}'s statement" → owner page, "Loan L{n}" → loan detail, "Expense in {month}" → Entries), "Entry voided" when applicable, and the timeline (Submitted, Edited, Approved, Rejected, Withdrawn, Cancelled, Disbursed with who and when). (F9)

#### Scenario: Open from a link
- **WHEN** `/en/requests?request=<id>` is loaded for a visible request
- **THEN** the sheet is open with that request's timeline

### Requirement: Home tie-ins
Home SHALL show, for `request.view.all`, a **Pending requests** tile with a yellow count and a **Review queue** link, and a reminder note listing requests pending over 3 days or approved past needed-by; for other users, the status of their latest open (PENDING or APPROVED) request, if any. (F13, F14)

#### Scenario: Pending tile
- **WHEN** one request is PENDING
- **THEN** the Super Admin's Home shows Pending requests "1" with a Review queue link to `/requests`

### Requirement: From request tags
Entries created by disbursal SHALL show "From request R-…" linking to the request: on the Advances tab rows and the owner statement (ADVANCE), on loan cards and the loan detail sheet (LOAN), and in the Entries list and detail drawer (grant EXPENSE). The Entries detail SHALL NOT offer Correct for a grant expense but SHALL offer Void. (§2.1 Other places, Rule 14)

#### Scenario: Grant in Entries
- **WHEN** the Super Admin opens the "Owner special grant · Sabrina Ahmed" expense
- **THEN** the drawer shows "From request R-2026-009", a Void action and no Correct action

### Requirement: Language, width and accessibility
All Requests screens and dialogs SHALL be fully translated in বাংলা and English, follow the BariHisab design system (ink on paper, zero radius, the one yellow signal reserved for pending/approved and the decision rule), use shadcn/ui components and Heroicons only, keep 44px touch targets, and work at 360px width with no horizontal scroll. (§12 General)

#### Scenario: Bangla at 360px
- **WHEN** an Owner opens `/bn/requests` on a 360px-wide screen
- **THEN** all labels are Bangla, amounts use Bangla digits, and the page has no horizontal scroll
