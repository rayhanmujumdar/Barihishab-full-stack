## Why

Owners ask the house for money by phone or WhatsApp today; nothing records the amount, the reason, who decided or why it was refused, and the Super Admin has to type the resulting advance, loan or grant expense by hand. The Requests PRD (`docs/requests_section_PRD.md`) turns every ask into a numbered, traceable request that the Super Admin decides with the owner's full money picture on one screen and pays out with a single action that creates the right entry in the books. Owners, Advances & Loans, Distribution and the email outbox now all exist, so Requests can plug into them without new accounting.

## What Changes

- **Requests screen** `/[lang]/requests` (main PRD S8): kicker "Advance · loan · special grant", **+ Request money**. Super Admin sees **Needs your decision** (overdue first), **Approved · awaiting cash**, **History** (filters owner/type/status/year). Owner sees **My requests** and **Paid out to owners**. Empty states per PRD §9. (F1, F12)
- **Request money form** (dialog, full screen on phones): type Advance / Loan / Special grant with help text, amount, "What is it for?" (10–500), needed-by (today or later, default +7 days), repayment plan (loan only), up to 3 attachments with a **Private** toggle; live hints: balance, advance limit used, owed-money hint, existing loan, grant cost per 10 % share, already-pending request. (F2, F15, G5, G8, G11, G12)
- **Request numbers** `R-{year}-{nnn}` per house per year, shown everywhere. (G9)
- **Edit** (requester, Pending) and **Cancel** (requester, Pending or Approved, with confirmation). (F3, G3, G4)
- **Decision card** with context panel (their balance, loan outstanding, advance limit, House Fund) and type-specific context: advance limit before/after + over-limit flag; active loans + 24-month plan check; grant effect on the open month's distributable and each owner's share. Warnings: another pending request, amount above House Fund. (F4, G7, G12)
- **Approve** (full or lower, ৳1…requested; note required when lower; "Approve and disburse now"), **Reject** (reason required), **Withdraw approval** (reason required). (F5, F6, F8, G2, G4)
- **Disburse** dialog: date, fund account (with balance), method, reference no. (required except Cash), loan instalment (pre-filled from the plan), grant month = latest open month. Creates exactly one linked entry in one transaction: Advance → ADVANCE on the owner's statement; Loan → new loan L{n}; Grant → expense "Owner special grant · {Owner}" with beneficiary. Disabled with "Open a month first" when no month is open; never repeatable. (F7, G1, G13; ADV-05)
- **Detail & timeline**: all fields, attachments, linked entry ("Advance on Nasrin's statement", "Loan L3", "Expense in October 2026"), "Entry voided" when the linked entry was voided/cancelled, timeline of every status change with who/when/why. (F9)
- **Self-requests** tagged **Self-approved**; **Record request for an owner** (incl. owners without login, "Recorded by {Admin}"). (F10, F11, G10, G15)
- **Visibility**: disbursed requests visible to every owner; Pending/Rejected/Cancelled/Withdrawn only to the requester and Super Admin; request attachments follow the same rule, Private files Super Admin + requester only. (F12, F15, G6)
- **Notifications**: in-app (nav badge, status on card) plus emails for every §10 event via the outbox, in each recipient's language, without bank details; Super Admin reminders for requests pending > 3 days and approved-but-unpaid past needed-by (email once + Home note). (F13, §10)
- **Tie-ins**: Requests nav item with badge (pending count for Super Admin; own requests with an unseen decision for Owners); Home **Pending requests** tile → Review queue (Super Admin) and latest open request (Owner); "From request R-…" on advances, loans and expenses created by disbursal. (F14, §2.1 Other places)

PRD coverage: Requests PRD F1–F15, G1–G15, §4 lifecycle, §5 permissions, §8 rules 1–16, §9 messages, §10 notifications, §12 acceptance criteria; main PRD ADV-03, ADV-04, ADV-05, flow D, S8, D16, `money_requests` (§9.4), `request_id` on `house_transactions` / `owner_ledger_entries` / `loans` (§9.3), endpoints `/requests…` (§10).

### Out of scope

- P3: family vote on grants/large loans, request templates, owner-to-owner comments.
- Loan repayment and advance recovery after payout (already in Advances & Loans / Distribution).
- Open questions §14 keep this PRD's defaults: Super Admin's decision is enough (no co-approval for grants or self-requests), owners see only paid-out requests of others, no yearly maximum, no auto-expiry, rejected requests stay private, no split at approval.
- Reminders run from the existing email worker loop; no new scheduler or push notifications.

## Capabilities

### New Capabilities
- `requests`: money request record and numbering, lifecycle and transitions, submit/edit/cancel/record-on-behalf, decision context, approve/reject/withdraw, disburse into advance/loan/grant expense, visibility rules, timeline, reminders and request emails.
- `requests-ui`: the `/requests` screen, request form, decision card, approve/reject/withdraw/disburse dialogs, detail sheet with timeline, nav badge, Home tile, and "From request" tags elsewhere.

### Modified Capabilities
- `rbac`: new permissions `request.create`, `request.view` (Owner + Super Admin), `request.view.all`, `request.decide`, `request.disburse`, `request.record` (Super Admin); Owner set grows to eleven keys, Super Admin to 44.
- `owner-ledger`: entry origin gains `REQUEST`; ledger entries expose their originating request.
- `loans`: loans may originate from a request (origin `REQUEST`, request link exposed).
- `house-transactions`: grant expenses from requests (source `REQUEST_GRANT`, beneficiary owner, request link); correct refused, void allowed.
- `attachments`: request attachments — owners with `request.create` may upload; per-file Private flag; file access follows request visibility.
- `email-outbox`: new `REQUEST_UPDATE` template for request events and reminders.

## Impact

- **DB**: one migration — enums `RequestType`, `RequestStatus`; table `money_requests` (no-delete trigger, amount CHECKs, unique number per property+year); `request_id` on `owner_ledger_entries`, `loans`, `house_transactions` with partial unique indexes (one entry per request); `house_transactions.beneficiary_owner_id`; `attachments.is_private`; `EntryOrigin` += `REQUEST`; `TxnSource` += `REQUEST_GRANT`; `EmailTemplate` += `REQUEST_UPDATE`. Additive only; no backfill touching ledger rows.
- **Code**: new `lib/accounting/requests.ts` (pure), `lib/requests/*` services; small refactors so advance/loan/grant creation can run inside the disburse transaction (`lib/owners/ledger-service.ts`, `lib/loans/loan-service.ts`); `lib/attachments/attachment-service.ts`, attachments presign/file routes, `lib/email/*`, `scripts/email-worker.ts`, `lib/permissions.ts`, `lib/audit.ts`, DTOs for ledger/loan/transaction, `lib/i18n/{en,bn}.ts`, ShellNav, app layout, Home.
- **API**: 10 endpoints under `/api/v1/requests…`, all registered in `app/api/v1/openapi.ts`.
- **Tests**: unit (pure module 100 %), integration API tests, component tests, Playwright `e2e/requests.spec.ts` (sorts after `period-distribution`, before `visual`, state-neutral). Existing suites must stay green.
