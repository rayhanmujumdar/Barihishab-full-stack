## Context

See proposal.md — Why. Everything a disbursal must create already exists, each behind its own `inTransaction`:

- **Advance**: `createAdvance` in `lib/owners/ledger-service.ts` (lock owner → `latestOpenPeriod` → limit check → `insertEntry` → attachments → warnings).
- **Loan**: `createLoanInTx` in `lib/loans/loan-service.ts` already runs inside a caller's transaction (used by payout split); `createLoan` wraps it.
- **Grant expense**: no service yet; the loan write-off in `lib/loans/repayment-service.ts` shows the pattern (system category, `tx.houseTransaction.create`, locked `source`). Category `OWNER_GRANT` ("Owner special grant") is already seeded and non-manual (`lib/master-data/defaults.ts`).
- **Advance limit / standing**: `standingByOwner` (`lib/loans/advance-service.ts`), `recentEntitlements` + `advanceLimit`.
- **Distributable**: `staircase`/`allocate` in `lib/accounting/distribution.ts`, month figures via `lib/distribution/month-data.ts`.
- **Attachments**: presign → `prepareAttachments` → `linkAttachments(tx, …, entityType)`; file proxy checks only `attachment.view` + property.
- **Email**: transactional outbox (`enqueueEmail`, dedupe key), templates rendered by `lib/email/render.ts`, sent by `scripts/email-worker.ts` (which also sweeps uploads).
- **History**: loans build their change history from `audit_logs`; there is no separate history table anywhere.
- UI pattern: server page loads data (`requirePagePermission`, sequential reads), client view uses `apiFetch` + `router.refresh()`, detail sheet driven by a search param (`?loan=` on `/advances`).

Constraints: integer paisa, never delete, every write = permission → zod → one transaction (data + audit + outbox), property scoping, `/api/v1` + Swagger, `await connection()` in GETs.

## Goals / Non-Goals

**Goals:**
- One new table and one service module; reuse the existing ledger/loan/expense writers instead of duplicating them.
- Disbursal is atomic: request status flip and the entry are in one transaction, and the DB refuses a second entry per request.
- Visibility enforced on the server for list, detail and attachments.

**Non-Goals:**
- No generic workflow/state-machine library, no separate timeline table, no notifications table.
- No new scheduler: reminders piggy-back on the email worker loop.
- No change to how advances are recovered or loans repaid.

## Decisions

### D1 — One `money_requests` table; links live on the entries
`money_requests(id, property_id, year, number, owner_id, type, amount_requested_paisa, amount_approved_paisa?, reason, needed_by date, repayment_plan?, status, is_self, created_by, recorded_on_behalf bool, decided_by?, decided_at?, decision_note?, decision_unseen bool default false, created_at, updated_at)` with `UNIQUE(property_id, year, number)`, CHECKs (`amount_requested_paisa > 0`, `amount_approved_paisa BETWEEN 100 AND amount_requested_paisa`), `(property_id, status)` index, and a no-delete trigger like the other financial tables.
The link back from the books is `request_id` on `owner_ledger_entries`, `loans` and `house_transactions` (exactly as main PRD §9.3 lists), each with a **partial unique index** `WHERE request_id IS NOT NULL`. The request never stores the entry id — the entry is found by reverse lookup (one indexed query per type).
*Alternative*: `ledger_entry_id/loan_id/transaction_id` on the request. Rejected: two sources of truth, and the "at most one entry per request" guarantee would need a trigger instead of an index.

### D2 — Numbers per property and year with an advisory lock
Same as loan numbers: `pg_advisory_xact_lock(hashtext('request_number:'||property||':'||year))`, then `max(number)+1`. Year = Asia/Dhaka year of submission. Format `R-2026-014` in a pure helper (`lib/accounting/requests.ts`).

### D3 — Pure module `lib/accounting/requests.ts` (100 % covered)
Holds everything rule-like so services stay thin: `canTransition(status, action)`, `approveCheck(requested, approved, note)`, `isOverdue(request, today)`, `formatRequestNumber`, `planInstalment(text)` (first number, Latin or Bangla digits, commas; × 100 → paisa), `finishesWithin(amount, instalment, 24)`, `grantImpact(staircaseInput, holders, amountPaisa)` (runs `staircase` + `allocate` with and without the extra expense → drop + per-owner drop), `reminderKinds(request, today)`, `shortReason(text, 80)`, `visibleTo(request, viewer)`.

### D4 — Disburse reuses "in-transaction" cores of the existing writers
Refactor without behaviour change:
- `ledger-service.ts`: extract `createAdvanceInTx(tx, propertyId, periodId, input, actor, extra)` from `createAdvance` (limit check, `insertEntry`, warnings); `createAdvance` keeps its public contract and calls it. `insertEntry`'s `NewEntry` gains `requestId`.
- `loan-service.ts`: `createLoanInTx` data gains `requestId` and `origin: "REQUEST"`.
- `transaction-service.ts`: new small `createGrantExpenseInTx(tx, …)` next to the write-off pattern (category `OWNER_GRANT`, `source: REQUEST_GRANT`, beneficiary, request id, `transaction.created` audit).
`disburseRequest` = lock request row (`FOR UPDATE`) → status must be APPROVED → `lockOwner` → `latestOpenPeriod` (throws `NO_OPEN_PERIOD`) → one of the three cores → status DISBURSED + audit + outbox rows → idempotency save. Any throw rolls everything back (request stays APPROVED). The partial unique index is the last line of defence against a double payout.
*Alternative*: call the public `createAdvance`/`createLoan` then update the request in a second transaction. Rejected: not atomic (Rule 7, F7 "all or nothing").

### D5 — New enum values instead of new flags
`EntryOrigin` += `REQUEST` (ledger + loans; reopen still reverses only `CLOSE`, so request advances survive a reopen). `TxnSource` += `REQUEST_GRANT`; `correctTransaction` refuses it with `NOT_EDITABLE` like `LOAN_WRITE_OFF`, but `voidTransaction` allows it (PRD Rule 14 says fix a grant by voiding the expense). `house_transactions.beneficiary_owner_id` (nullable FK → owners) per main PRD §9.3.

### D6 — Timeline from the audit log
Every request write already writes an audit row (`request.*`, entity `money_request`). Detail builds the timeline from those rows (actor name join), the same way loan history works. For non-privileged viewers of others' disbursed requests the mapper drops method/reference. *Alternative*: `request_events` table — duplicate data, rejected.

### D7 — Visibility in one place
`visibleTo` (pure) decides full / limited / none from `{ status, ownerUserId, createdById }` and the viewer's permissions + linked owner. List queries apply the same rule in SQL (`OR` of own-owner, created-by, `status = 'DISBURSED'`); detail returns `404` for "none" so ids can't be probed. Attachments: `openFile`/`fileMeta` get an optional viewer and, for `entity_type = 'money_request'`, load the request and apply `visibleTo` + `attachments.is_private`. Existing callers (house transactions, ledger, loans) are unaffected.

### D8 — Permissions
New keys: `request.create`, `request.view` (Owner + Super Admin), `request.view.all`, `request.decide` (approve/reject/withdraw), `request.disburse`, `request.record` (Super Admin). Presign accepts `request.create`; a non-Super-Admin may link only uploads they presigned (`uploaded_by = actor`). Requester actions (edit/cancel) are checked by ownership in the service, not by a separate permission.

### D9 — One email template, event in the payload
`EmailTemplate` += `REQUEST_UPDATE`; payload `{ event, requestId, number, ownerName, type, amountRequestedPaisa, amountApprovedPaisa, shortReason, note?, actorName, reminderKind? }`. One renderer with a per-event subject/lead line in bn/en. Dedupe key `request:{id}:{event}:{userId}` (reminders: `request:{id}:REMINDER:{kind}:{userId}`) so retries and repeated worker ticks queue once. Recipients resolved in the service: Super Admins = active users with role SUPER_ADMIN; owners = owners with an ACTIVE linked user; the actor is skipped. `note` is only included for the requester and Super Admins.
*Alternative*: ten templates. Rejected: ten near-identical files for no behaviour gain.

### D10 — Reminders
`requestReminders(propertyId, today)` (read) feeds the Home note. `queueRequestReminders()` runs each email-worker tick (after `sweepUnlinkedUploads`), finds PENDING with `created_at < now − 3 days` and APPROVED with `needed_by < today`, and enqueues with the dedupe key above — idempotent by construction.

### D11 — Badges without a notifications table
Super Admin badge = `count(status = PENDING)`. Owner badge = `count(decision_unseen)` for their requests; approve/reject/withdraw/disburse set it true, the Requests screen posts `POST /requests/seen` when it shows an unseen decision (reads never write). Computed in `app/[lang]/(app)/layout.tsx` next to the existing invite count and passed to `ShellNav` as `badges`.

### D12 — API surface
| Method | Path | Permission |
| --- | --- | --- |
| GET / POST | `/requests` | `request.view` / `request.create` (+`request.record` for `ownerId`) |
| GET | `/requests/form-context` | `request.create` |
| GET / PATCH | `/requests/{id}` | `request.view` / `request.create` (owner check) |
| POST | `/requests/{id}/cancel` | `request.create` (owner check) |
| POST | `/requests/{id}/approve`, `/reject`, `/withdraw` | `request.decide` |
| POST | `/requests/{id}/disburse` | `request.disburse`, `Idempotency-Key` |
Folders `app/api/v1/requests/{route.ts,schema.ts}`, `requests/form-context/`, `requests/[id]/` and `requests/[id]/{cancel,approve,reject,withdraw,disburse}/`; one `schema.ts` per folder imported in `app/api/v1/openapi.ts`. New error codes in `lib/api/errors.ts`: `INVALID_REQUEST_STATUS` (409), `NO_OWNER_PROFILE` (403).

### D13 — UI composition
`app/[lang]/(app)/requests/page.tsx` (server, `Suspense`, sequential reads, `?request=` / filter params) → `components/requests/RequestsView.tsx` (client). Pieces: `RequestCard`, `DecisionCard` (+ `ContextPanel`), `RequestFormDialog` (create/edit/record; reuses `AttachmentPicker` with a Private toggle and the themed date picker), `DecideDialogs` (approve / reject / withdraw share one reason-dialog component), `DisburseDialog`, `RequestDetailSheet` (timeline + `AttachmentGallery`), cancel via existing `ConfirmDialog`. Mutations: `apiFetch` + `router.refresh()` like Advances & Loans. Form context fetched once when the dialog opens (and when the amount changes for the grant hint, debounced 250 ms via `useDebouncedValue`). "From request" tag = a tiny shared `RequestTag` link component used in Entries, Advances table, loan card/sheet and owner statement.

### D14 — Tests
- Unit: `lib/accounting/requests.test.ts` (100 %), email template test, i18n key parity (existing test), `permissions.test.ts` counts.
- Integration (`tests/integration/api/requests*.test.ts`, real test DB): submit/record/edit/cancel; approve/reject/withdraw incl. races; disburse ×3 types incl. no open month, idempotency, double disburse, rollback; visibility + attachment access; outbox rows; reminders dedupe; grant expense NOT_EDITABLE/void; reopen keeps REQUEST advance. Helper `tests/helpers/requests.ts`.
- Component: `components/requests/requests.test.tsx` (cards per status/role, dialogs validation).
- E2E `e2e/requests.spec.ts`: owner submits → admin approves lower → owner sees decision → admin disburses advance → paid-out visible to another owner; reject flow; grant disburse visible in Entries; Owner forbidden actions; 360px Bangla check. Sorts after `period-distribution.spec.ts`, before `visual.spec.ts`; cancels/voids what it creates, leaves the current month open, calls `resetRateLimits()`.

### D15 — Deviations from the PRDs
- Main PRD marks Requests (ADV-03–05) and request emails as P2, and the Requests PRD splits P1/P2; the user asked for all Requests features, so P1 + P2 (F11 record on behalf, F13 reminders, all §10 emails) ship together. P3 stays out.
- Main PRD §9.4 status enum lacks `WITHDRAWN`; the Requests PRD (G4, §4) adds it — followed.
- Main PRD §10 shows `/approve { amount }`, `/reject { note }`, `/disburse { fund_account_id, date }`; the repo's camelCase paisa convention is kept (`amountPaisa`, `reason`, `fundAccountId`, `date`, plus `method`, `referenceNo`, `installmentPaisa`), and `/withdraw`, `/form-context` and `PATCH` are added for G3/G4/F2.
- Main PRD `money_requests` lists `decided_by/decided_at/decision_note`; we add `year`, `number`, `is_self`, `created_by`, `recorded_on_behalf`, `decision_unseen` (G9, G10, G15, F1 badge).
- Requests PRD F15 says attachments are visible "after disbursal also to all owners" — implemented, with the Private flag per file.

## Risks / Trade-offs

- [Refactoring `createAdvance` could change advance behaviour] → extract-only refactor; existing advance integration + e2e suites must pass unchanged before disburse code is added.
- [Advisory lock + max() numbering under very high concurrency] → single-house app; same proven pattern as loan numbers; unique index catches any slip.
- [Grant impact estimate differs from the final close (more entries later in the month)] → labelled "about"; computed from current open-month figures with the real reserve rule.
- [Owners can now presign uploads → storage abuse] → existing per-user presign rate limit, 5 MB cap, 24 h unlinked sweep, and owners can only link their own uploads.
- [Attachment visibility check adds a query per file view] → only for `money_request` files; one indexed lookup.
- [`decision_unseen` is cleared by any list load, even if the owner didn't read the card] → acceptable for a badge; status is always on the card and emailed.
- [Super Admin without an owner profile can't self-request] → returns `403 NO_OWNER_PROFILE` with a clear message; they can still record for owners.

## Migration Plan

1. One additive migration `2026111x_requests`: enums, `money_requests` + trigger/CHECKs/indexes, new nullable columns + partial unique indexes, enum values (`ALTER TYPE … ADD VALUE` outside the transaction block as Prisma requires), `attachments.is_private default false`. No backfill touching ledger rows, so the closed-period guard is never hit.
2. `prisma migrate dev` on the test DB via the test setup; dev DB `migrate deploy` only after the user confirms (shared dev DB, see earlier changes).
3. Rollback: the feature is additive — drop the route/nav entry; columns stay nullable and unused. Enum values can't be dropped in Postgres, which is harmless.

## Open Questions

- None blocking. PRD §14 questions are kept at the PRD defaults listed in proposal.md (Out of scope); each can be added later without changing this design.
