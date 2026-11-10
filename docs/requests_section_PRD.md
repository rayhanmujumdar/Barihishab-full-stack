# BariHisab — Requests Section PRD

> Version 1.0 · Nov 10, 2026 · Author: Rayhan (dev4@awfatech.com)
> Section: Requests (owners ask for an advance, a loan or a special grant; the Super Admin decides and pays it out)
> Depends on: Authentication & roles, Owners (balances), Advances & Loans, Income & Expenses (grant expense), Distribution (open month), Notices & email

This document covers **features and behaviour only**. Technical design (database, API, code structure) is left to the implementation.

## Table of Contents

1. [Overview](#1-overview)
2. [Design Analysis](#2-design-analysis)
3. [Key Concepts](#3-key-concepts)
4. [Request Lifecycle](#4-request-lifecycle)
5. [Who Can Do What](#5-who-can-do-what)
6. [Features](#6-features)
7. [User Flows](#7-user-flows)
8. [Business Rules](#8-business-rules)
9. [Messages, Warnings & Empty States](#9-messages-warnings--empty-states)
10. [Notifications](#10-notifications)
11. [Worked Examples](#11-worked-examples)
12. [Acceptance Criteria](#12-acceptance-criteria)
13. [Release Phases](#13-release-phases)
14. [Open Questions](#14-open-questions)

---

## 1. Overview

Requests turn "Can I get some money from the house?" — usually a phone call or a WhatsApp message — into a written, traceable decision. An owner asks for an **Advance**, a **Loan** or a **Special grant** with a reason; the Super Admin sees the owner's full money picture, approves (possibly a lower amount) or rejects with a reason, and later pays it out. Paying out automatically creates the right entry in the books and tells every owner.

### Goals

- Every money request is written down with amount, purpose and date needed.
- The Super Admin decides with all the facts on one screen: balance, loans, advance limit, House Fund.
- Decisions are fair and visible: rejections always have a reason; paid-out requests are shown to every owner.
- Paying out never needs double entry — the advance, loan or grant expense is created from the request.

### In scope

- Request money form (Advance / Loan / Special grant)
- My requests (owner) and the decision queue (Super Admin)
- Approve (full or lower amount), reject with reason
- Disburse (pay out) with fund, method, reference and loan instalment
- Cancel by the requester, withdraw an approval by the Super Admin
- Edit a pending request
- Self-requests by the Super Admin (Self-approved tag)
- Request on behalf of an owner (Super Admin)
- Attachments (medical bill, admission letter)
- Paid-out requests visible to all owners
- Reminders and emails

### Out of scope

- Loan repayment and instalments after payout (Advances & Loans section)
- Advance recovery (Owners and Distribution sections)
- Family voting on requests (Phase 3 idea, see section 13)

### Success metrics

| Metric | Target |
| --- | --- |
| Requests decided within 3 days | ≥ 90% |
| Rejections with a written reason | 100% |
| Disbursed requests that created the right entry automatically | 100% |
| Money paid to owners outside a request or direct entry with reason | 0 |
| Owners who know the status of their request without asking | 100% (status always on screen + email) |

---

## 2. Design Analysis

What the BariHisab design shows for Requests, and what it leaves open.

### 2.1 What the design shows

**Header**

- Kicker "Advance · loan · special grant", title "Requests".
- **+ Request money** (primary) for everyone. On the Owner's top bar the main action is also "+ Request money".

**Super Admin — "Needs your decision"** (only when something is pending; ruled with a yellow line)

Each pending request card:

| Left side | Right side |
| --- | --- |
| **Pending** tag · "Asked {date} · Needed by {date}" | Context panel: **Their balance** (coloured) · **Loan outstanding** · **Advance limit** · **House fund** |
| Amount in large type + type (Advance / Loan / Special grant) | Red note when an advance is above the limit: "Above the advance limit — allowed, but flagged." |
| Owner name | **Approve** (primary) · **Reject** (secondary) |
| Reason in quotes | |
| "Repayment plan · {plan}" for loans | |

Nothing pending → "No requests waiting. Owners' new requests land here and you get an email."

**List below** — Super Admin: "Decided & in progress"; Owner: "My requests"

Each card: status tag, **Self-approved** tag when relevant, "Asked … · Needed by …", "{Owner} · {type}", reason, "Admin: {note}", requested amount, "Approved ৳X" when lower, and actions:
- **Disburse · posts an advance** / **Disburse · opens a loan** / **Disburse · books an expense** (Super Admin, approved requests)
- **Cancel request** (requester, pending requests)

Status tags: **Pending**, **Approved · awaiting cash**, **Disbursed**, **Rejected**, **Cancelled**.
Empty: "No requests yet." + **Request money**.

**Request money dialog**

- Type segment: **Advance** · **Loan** · **Special grant**, each with help text:
  - Advance: "Taken from your future entitlements automatically. No repayment needed."
  - Loan: "A separate loan ledger. Repay in cash or by deduction from entitlement."
  - Special grant: "Non-refundable. Booked as a house expense, so it reduces every owner's share — all owners are emailed when it is paid."
- "Your balance now: ৳X".
- Amount (৳), "What is it for?", Needed by, Repayment plan (loan only, hint "৳4,000 per month from entitlement").
- **Cancel** / **Submit request** → "Request sent · the Admin has been emailed".

**Approve dialog**

- "{Owner} asked for ৳X ({type}). You may approve a lower amount."
- Own request: "This is your own request — it is tagged 'Self-approved' and every owner is emailed."
- Approved amount (৳), Note to requester (optional). **Cancel** / **Approve**.

**Reject dialog**

"Reject this request? {Owner} is emailed with your reason." + required reason → **Reject request**.

**Other places**

- Home (Super Admin): "Pending requests" tile with a yellow count → "Review queue".
- Sidebar / bottom nav: Requests badge with the pending count.
- Advances & Loans and Income & Expenses show "From request" on entries created by disbursal.

### 2.2 Sample data in the design

| Owner | Type | Asked | Needed by | Amount | Status | Admin note |
| --- | --- | --- | --- | --- | --- | --- |
| Nasrin Ahmed | Advance — "Cataract surgery deposit at Ispahani Eye Hospital" | 19 Oct | 30 Oct | ৳10,000 | Pending | — |
| Tanvir Ahmed | Advance — "Car service before the trip home" | 18 Oct | 25 Oct | ৳8,000 → approved ৳6,000 | Approved · awaiting cash | "Reduced — bank balance is low until rent clears" |
| Tanvir Ahmed | Loan — "Home renovation", plan "৳4,000 per month" | 12 Sep | 30 Sep | ৳20,000 | Rejected | "Existing loan L2 still has ৳40,000 outstanding" |
| Sabrina Ahmed | Special grant — "Medical bills after the accident" | 10 Aug | 15 Aug | ৳6,000 | Disbursed | "Approved after family call on 11 Aug" |

### 2.3 Gaps found and decisions

| # | Gap in the design | Decision |
| --- | --- | --- |
| G1 | Disburse pays out at once with a fixed fund account and method, no reference no. and no loan instalment | **Disburse dialog**: date, fund account, method, reference no., and for loans the monthly instalment (pre-filled from the plan) |
| G2 | Approving more than requested or ৳0 silently does nothing | Clear error: "Approve between ৳1 and ৳{requested}." |
| G3 | A pending request can't be changed, only cancelled | Requester can **edit** while Pending |
| G4 | An approved request can't be undone before payment | Super Admin can **Withdraw approval** (reason); requester can **Cancel** until disbursed |
| G5 | "Needed by" defaults to today and can be in the past | Must be today or later; pending requests past their date get an **Overdue** tag |
| G6 | Owners see only their own requests, even after money is paid out | Everyone sees **disbursed** requests (name, type, amount, reason); pending, rejected and cancelled stay private to the requester and Super Admin |
| G7 | Decision context is the same for all types | Type-specific context: loan → existing loans and plan check; grant → effect on each owner's share |
| G8 | No attachments | Up to 3 files (medical bill, school letter) — JPG, PNG, WebP or PDF, 5 MB each |
| G9 | No reference number for a request | Each request gets a number (e.g. **R-2026-014**) shown everywhere |
| G10 | No way to record a request someone made by phone, or for an owner without login | Super Admin can **Record request for an owner** (marked "Recorded by {Admin}") |
| G11 | An owner who is owed money can still ask for an advance | Form hint: "You're owed ৳X — ask the Admin for a payout instead, or request only the extra." |
| G12 | Several pending requests from one owner aren't flagged | Warning on submit and on the decision card: "You already have a pending request (R-…)." |
| G13 | Disbursing needs an open month but nothing says so | Disburse disabled with "Open a month first" when no month is open |
| G14 | No reminder for old pending or approved-but-unpaid requests | Super Admin reminder: pending > 3 days, approved and not paid by the needed-by date |
| G15 | Self-approval only shows a tag | Self-requests show a "Self" note in the queue, get the **Self-approved** tag, and every owner is emailed on approval **and** on disbursal |

---

## 3. Key Concepts

### Request types

| Type | What the owner gets | How it is paid back | Effect on others | Created on disburse |
| --- | --- | --- | --- | --- |
| **Advance** | Money ahead of future shares | Automatically from the next entitlements | None directly | Advance on the owner's statement (balance goes negative) |
| **Loan** | A separate loan | Cash or deductions, optional monthly instalment | None directly | New loan in the loan ledger (L1, L2, …) |
| **Special grant** | Money that is never paid back | Not paid back | Reduces the month's distributable, so **every owner's share** goes down by their % | House expense "Owner special grant" linked to the owner |

### Requested vs approved amount
The Super Admin can approve the full amount or less, never more. The approved amount is what gets paid.

### Disburse
The moment the money actually leaves the House Fund. Approval alone moves no money.

### Self-request
A request by the Super Admin for themself. It follows the same steps, but is tagged **Self-approved** and every owner is told.

---

## 4. Request Lifecycle

| Status | Meaning | Tag | Next possible status |
| --- | --- | --- | --- |
| **Pending** | Waiting for the Super Admin | Pending (outline) | Approved, Rejected, Cancelled |
| **Approved · awaiting cash** | Agreed, not paid yet | Yellow | Disbursed, Cancelled (by requester), Withdrawn (by Super Admin) |
| **Disbursed** | Paid out; entry created | Neutral | — (final) |
| **Rejected** | Declined with a reason | Neutral | — (final; the owner can send a new request) |
| **Cancelled** | Withdrawn by the requester | Neutral | — (final) |
| **Withdrawn** | Approval taken back by the Super Admin, with a reason | Neutral | — (final) |

Extra tags: **Overdue** (pending past needed-by), **Self-approved**, **Recorded by Admin**.

Every status change records who, when and why, and appears in the request's own timeline.

---

## 5. Who Can Do What

| Feature | Super Admin | Owner |
| --- | --- | --- |
| Submit a request for themself | ✓ (Self) | ✓ |
| Edit own pending request | ✓ | ✓ |
| Cancel own request (pending or approved) | ✓ | ✓ |
| See own requests in full | ✓ | ✓ |
| See all pending, rejected, cancelled requests | ✓ | ✗ (own only) |
| See all disbursed requests | ✓ | ✓ |
| See decision context (balance, loans, limit, fund) | ✓ | ✗ (sees own balance on the form) |
| Approve / approve lower / reject | ✓ | ✗ |
| Withdraw an approval | ✓ | ✗ |
| Disburse | ✓ | ✗ |
| Record a request for another owner | ✓ | ✗ |

The server checks every action again, whatever the screen shows.

---

## 6. Features

### F1 · Requests page layout — P1

- Kicker "Advance · loan · special grant", title "Requests", **+ Request money** button.
- **Super Admin** sees, top to bottom:
  1. **Needs your decision** — pending requests, oldest needed-by first (overdue at the top).
  2. **Approved · awaiting cash** — approved, not yet paid, earliest needed-by first.
  3. **History** — disbursed, rejected, cancelled, withdrawn; newest first; filters: owner, type, status, year.
- **Owner** sees:
  1. **My requests** — all their own, newest first.
  2. **Paid out to owners** — everyone's disbursed requests (owner, type, amount, reason, date), newest first.
- Sidebar and bottom-nav badge: number of pending requests (Super Admin) or own requests with a new decision (Owner).

### F2 · Request money form — P1

- Opens as a dialog (full screen on phones).
- Fields:
  - **Type**: Advance (default) · Loan · Special grant, with the help text from 2.1.
  - **Amount (৳)** — required, above ৳0.
  - **What is it for?** — required, 10–500 characters; the hint says other owners may see it once paid.
  - **Needed by** — required, today or later (default: 7 days from today).
  - **Repayment plan** — loan only, optional free text ("৳4,000 per month from entitlement").
  - **Attachments** — optional, up to 3 files.
- Live info for the requester:
  - "Your balance now: ৳X" (coloured, labelled).
  - Advance: "Your advance limit is about ৳X; you've used ৳Y." and a soft warning above the limit.
  - Advance when owed money: hint G11.
  - Loan: "You have L2 with ৳X left." if they already have a loan.
  - Special grant: "This is shared by everyone — about ৳X less for each 10% share."
- **Submit request** → status Pending, request number given, toast "Request sent · the Admin has been emailed".

### F3 · Edit or cancel a request (requester) — P1

- **Edit** while Pending: any field; the timeline shows "Edited".
- **Cancel request** while Pending or Approved (before payout): confirmation "Cancel R-…? The Admin is told." → Cancelled.

### F4 · Decision queue card — P1 (Super Admin)

Each pending request shows:

- Status tag, Overdue tag if late, request number, "Asked {date} · Needed by {date}".
- Amount (large) + type, owner name, reason, repayment plan (loans), attachments.
- **Context panel** (all types): Their balance · Loan outstanding · Advance limit · House fund.
- **Type-specific context**:
  - Advance: limit used before and after this request; red "Above the advance limit — allowed, but flagged." when over.
  - Loan: list of active loans with amounts left; whether the proposed plan would finish within 24 months.
  - Special grant: "Distributable for {open month} drops by about ৳X; each owner's share drops by their %." and a small per-owner list.
- Warnings: another pending request from the same owner; amount above the House Fund.
- Actions: **Approve**, **Reject**.

### F5 · Approve — P1 (Super Admin)

- Dialog: "{Owner} asked for ৳X ({type}). You may approve a lower amount."
- Self-request: "This is your own request — it is tagged 'Self-approved' and every owner is emailed."
- **Approved amount** (default: requested; must be ৳1 to the requested amount).
- **Note to requester** (optional; required when approving less: "Explain why the amount is lower.").
- Option **Approve and disburse now** (opens F7 straight after).
- Result: status Approved · awaiting cash; requester emailed; toast "Approved · requester emailed".

### F6 · Reject — P1 (Super Admin)

- Dialog "Reject this request? {Owner} is emailed with your reason." with required reason.
- Result: status Rejected, reason shown as "Admin: {reason}" on the card; requester emailed.

### F7 · Disburse — P1 (Super Admin)

- Button text by type: **Disburse · posts an advance** / **Disburse · opens a loan** / **Disburse · books an expense**.
- Dialog fields:
  - Amount (the approved amount, read-only).
  - Date (default today), fund account (with balance), method (Cash / Bank / bKash / Nagad), reference no. (required except Cash).
  - Loan only: **Monthly instalment** (pre-filled from the plan when it has a number; can be "Manual").
  - Special grant only: the month it is booked to (latest open month) and a reminder that every owner will be emailed.
- Warnings: fund too low; month not open (then disabled).
- Result:
  - Advance → an **Advance** entry on the owner's statement, note "Advance · {reason}", linked to the request.
  - Loan → a new **loan** with the next number, instalment and reason, linked to the request.
  - Grant → an expense "Owner special grant · {Owner}" in the open month, beneficiary set, linked to the request.
  - Status Disbursed; every owner emailed; toast "Disbursed · entry created · all owners emailed".
- Disbursal is all or nothing: if the entry can't be created, the request stays Approved.

### F8 · Withdraw approval — P1 (Super Admin)

- For Approved requests not yet paid (e.g. the House Fund ran short).
- Reason required; status Withdrawn; requester emailed.

### F9 · Request detail & timeline — P1

- Tap any card → detail: all fields, attachments, linked entry after disbursal ("Advance on Nasrin's statement", "Loan L3", "Expense in October 2026").
- **Timeline**: Submitted → Edited → Approved (amount, note) / Rejected (reason) → Disbursed (date, method, ref.) / Cancelled / Withdrawn — each with who and when.

### F10 · Self-requests — P1

- The Super Admin uses the same **Request money** form.
- Their pending request shows "Your own request" in the queue.
- Approval tags it **Self-approved**; every owner is emailed on approval and on disbursal.

### F11 · Record a request for an owner — P2 (Super Admin)

- **Record request for…** in the ⋯ menu: pick the owner (including owners without login), fill the same form.
- Card shows "Recorded by {Admin} on behalf of {Owner}"; the owner (if they have a login) is emailed a copy.

### F12 · Visibility of paid-out requests — P1

- Disbursed requests appear for every owner in **Paid out to owners**: owner, type, amount, reason, date, approved by.
- Pending, rejected, cancelled and withdrawn requests are visible only to the requester and the Super Admin.

### F13 · Reminders — P2

- Super Admin: email + dashboard note when a request has been pending for 3 days, and when an approved request passes its needed-by date unpaid.
- Requester: no reminders (they get status emails instead).

### F14 · Dashboard and navigation tie-ins — P1

- Home (Super Admin): **Pending requests** tile with a yellow count → **Review queue**.
- Home (Owner): their latest request status, if any is open.
- Badge on Requests in the sidebar and bottom nav.

### F15 · Attachments — P1

- Up to 3 files per request; JPG, PNG, WebP or PDF; 5 MB each; images compressed before upload.
- Visible to the requester and Super Admin; after disbursal also to all owners (with the request), unless the requester marked a file **Private** (Super Admin only).

---

## 7. User Flows

### 7.1 Owner asks for an advance

1. Nasrin opens **Requests** → **+ Request money** → Advance.
2. Sees "Your balance now: −৳5,000" and "Your advance limit is about ৳33,163; you've used ৳5,000."
3. Enters ৳10,000, "Cataract surgery deposit at Ispahani Eye Hospital", needed by 30 Oct, attaches the hospital estimate.
4. **Submit request** → R-2026-014 Pending; the Super Admin is emailed.

### 7.2 Super Admin approves a lower amount and pays later

1. Tanvir asks for ৳8,000 (car service). Queue shows his balance, loan L2 ৳35,000 left, limit about ৳12,436, House Fund.
2. **Approve** → ৳6,000, note "Reduced — bank balance is low until rent clears".
3. Tanvir is emailed; card moves to **Approved · awaiting cash**.
4. When rent clears: **Disburse · posts an advance** → bKash, TrxID → done; all owners emailed.

### 7.3 Rejection

1. Tanvir asks for a ৳20,000 loan, plan ৳4,000 / month.
2. Context shows L2 still has money left.
3. **Reject** → reason "Existing loan L2 still has ৳40,000 outstanding".
4. Tanvir is emailed with the reason; the card shows **Rejected · Admin: …**.

### 7.4 Special grant

1. Sabrina asks for ৳6,000 after an accident (non-refundable).
2. Queue shows the effect: "Distributable for August drops by about ৳5,700."
3. After a family call, **Approve** with note "Approved after family call on 11 Aug", then **Disburse · books an expense**.
4. Expense "Owner special grant · Sabrina Ahmed" appears in August; all owners emailed; everyone sees it in **Paid out to owners**.

### 7.5 Owner changes their mind

1. Owner opens their pending or approved request → **Cancel request** → confirm.
2. Status Cancelled; the Super Admin is told.

### 7.6 Super Admin requests for themself

1. Rayhan submits an advance request.
2. Queue shows "Your own request"; on **Approve** it is tagged **Self-approved**; every owner is emailed.
3. Disbursal emails everyone again.

---

## 8. Business Rules

1. Every request needs a type, amount above ৳0, reason and needed-by date (today or later).
2. Only the requester can edit, and only while Pending.
3. The requester can cancel while Pending or Approved; never after Disbursed.
4. The approved amount is between ৳1 and the requested amount; approving less needs a note.
5. Rejecting and withdrawing need a reason; the requester always sees it.
6. Approval moves no money; only Disburse does.
7. Disburse needs an open month and creates exactly one linked entry (advance, loan or grant expense); it can't be repeated.
8. Disbursed, Rejected, Cancelled and Withdrawn are final; a new request can be sent instead.
9. The type can't change after approval (to change it, reject or withdraw and ask again).
10. Advance above the limit, a second pending request, and amounts above the House Fund are warnings, never blocks.
11. Self-requests follow the same rules, are tagged **Self-approved**, and every owner is emailed on approval and disbursal.
12. Pending, rejected, cancelled and withdrawn requests are private to the requester and the Super Admin; disbursed requests are visible to all owners.
13. A special grant always reduces the distributable of the month it is booked to, so every owner shares its cost by their %.
14. Fixing a wrong disbursement is done where the entry lives (void the advance in the owner's statement, cancel the loan, or void the expense); the request then shows "Entry voided".
15. Every action is recorded in the request timeline and the Audit Log.
16. Money shows as ৳ with lakh grouping; Bangla digits in Bangla.

---

## 9. Messages, Warnings & Empty States

| Situation | Message |
| --- | --- |
| No amount | "Enter an amount greater than zero." |
| No reason | "Tell everyone what it is for." |
| Needed-by in the past | "Pick today or a later date." |
| Owed money, asking advance | ⚠ "You're owed ৳X — ask the Admin for a payout instead, or request only the extra." |
| Over advance limit | ⚠ "Above the advance limit — allowed, but flagged." |
| Already has a loan | ⚠ "You have {Loan no.} with ৳X left." |
| Second pending request | ⚠ "You already have a pending request ({number})." |
| Grant impact | "This is shared by everyone — about ৳X less for each 10% share." |
| Request sent | "Request sent · the Admin has been emailed" |
| Approve amount invalid | "Approve between ৳1 and ৳{requested}." |
| Approve lower without note | "Explain why the amount is lower." |
| Approved | "Approved · requester emailed" |
| Reject without reason | "Please write a reason — {Owner} will see it." |
| Rejected | "Request rejected · requester emailed" |
| Disburse with no open month | "Open a month first — payouts are recorded in an open month." |
| Fund too low | ⚠ "This is more than {fund account} holds (৳X)." |
| Disbursed | "Disbursed · entry created · all owners emailed" |
| Cancelled | "Request cancelled" |
| Approval withdrawn | "Approval withdrawn · requester emailed" |
| Nothing pending (Super Admin) | "No requests waiting. Owners' new requests land here and you get an email." |
| No requests yet (Owner) | "No requests yet." + **Request money** |
| Nothing paid out yet | "Nothing has been paid out through requests yet." |

---

## 10. Notifications

| Event | Who is told | Phase |
| --- | --- | --- |
| New request submitted | Super Admin | P2 |
| Request edited or cancelled | Super Admin | P2 |
| Approved (amount, note) | Requester | P2 |
| Self-approved | All owners | P2 |
| Rejected (reason) | Requester | P2 |
| Approval withdrawn (reason) | Requester | P2 |
| Disbursed (who, type, amount, short reason, approved by) | **All owners** | P2 |
| Pending for 3 days / approved past needed-by | Super Admin | P2 |
| Recorded on behalf | That owner | P2 |

In P1 the same events show as in-app notices (badge + status on the card). Emails are in each person's language, never include bank details, and other owners get only the short reason.

---

## 11. Worked Examples

Figures from the design's sample data.

### 11.1 Nasrin's pending advance (decision context)

| Context | Value |
| --- | --- |
| Request | Advance ৳10,000 — cataract surgery deposit, needed by 30 Oct |
| Their balance | −৳5,000 (advance outstanding) |
| Loan outstanding | None |
| Advance limit (1× average of Jul–Sep entitlements) | ≈ ৳33,163 |
| Limit used after approval | ৳15,000 (45%) — within limit |
| House Fund | ৳1,24,508.75 (Cash ৳31,000 + Bank ৳93,508.75) |

### 11.2 Tanvir's advance approved lower

Requested ৳8,000 → approved ৳6,000 with note "Reduced — bank balance is low until rent clears". Status **Approved · awaiting cash** until disbursed. His limit is about ৳12,436, so the request was within limit; the reduction is about cash in the fund.

### 11.3 Sabrina's special grant — cost to each owner

August 2026 distributable was ৳92,644 without the grant and ৳86,944 with it — **৳5,700 less** (the 5% reserve absorbs ৳300 of the ৳6,000).

| Owner | Share | Less in August |
| --- | --- | --- |
| Nasrin Ahmed | 40% | ৳2,280 |
| Rayhan Ahmed | 25% | ৳1,425 |
| Tanvir Ahmed | 15% | ৳855 |
| Farzana Haque | 10% | ৳570 |
| Sabrina Ahmed | 10% | ৳570 (she received ৳6,000) |

---

## 12. Acceptance Criteria

### Submitting
- [ ] An owner can submit an advance, loan or grant request with amount, reason and needed-by date; it gets a number and is Pending
- [ ] Past needed-by dates and empty reasons are refused
- [ ] The requester can edit while Pending and cancel while Pending or Approved

### Deciding
- [ ] The Super Admin sees every pending request with balance, loans, limit and House Fund, plus type-specific context
- [ ] Approve accepts ৳1 up to the requested amount; lower needs a note
- [ ] Reject needs a reason, which the requester sees
- [ ] Withdraw approval needs a reason and works only before payout
- [ ] Self-requests get the Self-approved tag

### Paying out
- [ ] Disburse is possible only for Approved requests and only with an open month
- [ ] Advance → one advance on the owner's statement; Loan → one new loan with instalment; Grant → one expense with beneficiary — each linked both ways
- [ ] Disburse can't be done twice; a failure leaves the request Approved
- [ ] All owners can see disbursed requests; other statuses stay private

### General
- [ ] Owners never see Approve, Reject, Disburse or other owners' pending requests, and are refused if they try
- [ ] Every status change appears in the request timeline and the Audit Log
- [ ] All screens work at 360px width, in বাংলা and English

---

## 13. Release Phases

| Phase | Features |
| --- | --- |
| **P1 — MVP** | F1 Page layout · F2 Request form · F3 Edit/cancel · F4 Decision card · F5 Approve · F6 Reject · F7 Disburse · F8 Withdraw approval · F9 Detail & timeline · F10 Self-requests · F12 Paid-out visibility · F14 Dashboard tie-ins · F15 Attachments · in-app status notices |
| **P2** | F11 Record on behalf · F13 Reminders · all emails in section 10 |
| **P3** | Family vote for special grants and large loans (e.g. majority of shares must agree) · request templates (school fees, medical) · owner-to-owner comments on a paid-out request |

---

## 14. Open Questions

- [ ] Do special grants need other owners' agreement before approval, or is the Super Admin's decision enough?
- [ ] Should a Super Admin's self-request need a second owner's approval?
- [ ] Should owners see other owners' pending requests (more transparency) or only paid-out ones (this PRD)?
- [ ] Is there a maximum loan or grant amount per year per owner?
- [ ] Should a request expire automatically if not decided in, say, 30 days?
- [ ] Should rejected requests also be visible to all owners after some time, for fairness?
- [ ] Can a request be split (part advance, part loan) at approval?