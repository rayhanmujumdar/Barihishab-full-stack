## 1. Setup

- [x] 1.1 Leave the uncommitted owner-avatar work untouched (not part of this change; the user commits it separately); run the full suite once for a green baseline (`pnpm test`, `pnpm test:int`, `pnpm test:e2e`) and note any pre-existing failures
- [x] 1.2 Read `node_modules/next/dist/docs/` for route handlers (Promise `params`), page `searchParams`, `connection()` + Cache Components; read `.agents/skills/barihisab-design-system/SKILL.md` and `.agents/skills/tdd`; re-read `docs/requests_section_PRD.md` §2–§12

## 2. Permissions, error codes, audit actions (`rbac`, design D8, D12)

- [x] 2.1 Write failing tests in `lib/permissions.test.ts`: Super Admin has 44 keys; Owner has exactly 11 (adds `request.create`, `request.view`); Owner lacks `request.view.all`, `request.decide`, `request.disburse`, `request.record`
- [x] 2.2 Add the six `request.*` keys to `lib/permissions.ts`; make 2.1 pass
- [x] 2.3 Write failing tests in `lib/api/errors.test.ts` for `INVALID_REQUEST_STATUS` (409) and `NO_OWNER_PROFILE` (403), en + bn
- [x] 2.4 Add the error codes; add audit actions `request.submitted`, `request.recorded`, `request.edited`, `request.cancelled`, `request.approved`, `request.rejected`, `request.withdrawn`, `request.disbursed` to `lib/audit.ts` and mark them financial; make 2.3 pass

## 3. Pure module `lib/accounting/requests.ts` (design D3)

- [x] 3.1 Write failing tests `lib/accounting/requests.test.ts`: `canTransition` for every status × action (allowed set from spec, all others false); `approveCheck` (0, 100, requested, requested+1, lower without note → "Explain why the amount is lower.", message "Approve between ৳1 and ৳8,000."); `formatRequestNumber` (R-2026-014, R-2027-001, R-2026-1000); `isOverdue`; `planInstalment` ("৳4,000 per month" → 400000, "৪,০০০ টাকা" → 400000, "Manual" → null); `finishesWithin` (2000000 / 400000 / 24 → true; 2000000 / 50000 → false); `grantImpact` (distributable 9264400, 5 % reserve, grant 600000 → drop 570000; 40/25/15/10/10 % → 228000/142500/85500/57000/57000; no surplus → drop equals the amount up to the distributable); `reminderKinds` (pending 3 vs 4 days, approved past needed-by); `shortReason` (≤ 80 with ellipsis); `visibleTo` (Super Admin full; own owner full; creator full; other owner DISBURSED limited; other owner PENDING/REJECTED/CANCELLED/WITHDRAWN none)
- [x] 3.2 Implement `lib/accounting/requests.ts` using `staircase`/`allocate`; confirm 100 % coverage with `pnpm test:coverage`

## 4. Data model and migration (design D1, D5)

- [x] 4.1 Write failing tests `tests/integration/db/requests-schema.test.ts`: `DELETE FROM money_requests` raises; `amount_requested_paisa = 0` refused; approved > requested refused; duplicate `(property_id, year, number)` refused; second ledger entry / loan / house transaction with the same `request_id` refused; `attachments.is_private` defaults false
- [x] 4.2 Prisma schema: enums `RequestType`, `RequestStatus`; model `MoneyRequest` with relations (owner, created-by, decided-by, property); `requestId` on `OwnerLedgerEntry`, `Loan`, `HouseTransaction`; `HouseTransaction.beneficiaryOwnerId`; `Attachment.isPrivate`; `EntryOrigin.REQUEST`; `TxnSource.REQUEST_GRANT`; `EmailTemplate.REQUEST_UPDATE`
- [x] 4.3 `prisma migrate dev --create-only --name requests`; hand-add CHECKs, `(property_id, status)` index, partial unique indexes `WHERE request_id IS NOT NULL`, no-delete trigger + `REVOKE DELETE` on `money_requests`; keep enum `ADD VALUE`s valid for Prisma; apply to `barihishab_test`, `prisma generate`
- [x] 4.4 Add `money_requests` to the `tests/helpers/db.ts` TRUNCATE list; add `tests/helpers/requests.ts` (`createRequest`, `approveRequest` factories with sensible defaults); make 4.1 pass

## 5. Extract in-transaction writers (design D4) — no behaviour change

- [x] 5.1 Run the existing advances/loans/payouts/transactions integration tests as the guard for this refactor
- [x] 5.2 Extract `createAdvanceInTx` from `createAdvance` in `lib/owners/ledger-service.ts`; `NewEntry` gains `requestId`; ledger DTO exposes `request: { id, number } | null`
- [x] 5.3 `createLoanInTx` accepts `requestId` and `origin: "REQUEST"`; loan DTO / list / detail expose `request`
- [x] 5.4 Add `createGrantExpenseInTx` in `lib/transactions/transaction-service.ts` (category `OWNER_GRANT`, source `REQUEST_GRANT`, beneficiary, request id, `transaction.created` audit); txn DTO exposes `beneficiaryOwnerId` and `request`
- [x] 5.5 Write failing tests in `tests/integration/api/transactions.test.ts`: PATCH of a `REQUEST_GRANT` expense → `409 NOT_EDITABLE` with the request message; void is allowed; then refuse in `correctTransaction` only; re-run 5.1 green

## 6. Request service — submit, record, edit, cancel, form context (`requests`)

- [x] 6.1 Write failing tests `tests/integration/api/requests-submit.test.ts`: submit 201 with number R-{year}-001 then -002, PENDING, audit, one `SUBMITTED` outbox row per active Super Admin (none to the actor); validation 422s (amount, reason length, past needed-by, >3 files); plan dropped for non-loans; warnings `PENDING_EXISTS`, `ADVANCE_OVER_LIMIT`, `OWNER_OWED`, `OWNER_HAS_LOAN`; isSelf for a Super Admin owner; no linked owner → `403 NO_OWNER_PROFILE`; concurrent submits get distinct numbers; record-on-behalf (owner without login → no email; with login → `RECORDED` email; Owner with other `ownerId` → 403); edit PENDING (audit before/after, `EDITED` email), edit APPROVED → 409, edit by another owner → 404; cancel PENDING and APPROVED → CANCELLED + `CANCELLED` email, cancel DISBURSED → 409; form-context figures for Nasrin and 403 for another owner's context
- [x] 6.2 Implement `lib/requests/request-service.ts` (submit/record/edit/cancel with `nextRequestNumber` under advisory lock, row lock `FOR UPDATE`, attachment linking with entity `money_request` + private flags, uploader check for non-admins) and `lib/requests/context-service.ts` (form context reusing `standingByOwner`/`recentEntitlements`, `activeLoans`, `houseFundBalance`, latest open month, grant per-10 % hint); make 6.1 pass

## 7. Request service — decide and disburse (`requests`, `owner-ledger`, `loans`, `house-transactions`)

- [x] 7.1 Write failing tests `tests/integration/api/requests-decide.test.ts`: approve full / lower with note / lower without note 422 / above requested 422 / 0 422; APPROVED + `decision_unseen` + `APPROVED` email; self-request → `SELF_APPROVED` to every active owner; reject needs reason, stores note, `REJECTED` email; withdraw APPROVED only, `WITHDRAWN` email; reject APPROVED → 409; concurrent approves → one 200, one 409; Owner → 403 on approve/reject/withdraw/disburse
- [x] 7.2 Write failing tests `tests/integration/api/requests-disburse.test.ts`: Advance → one ADVANCE (−approved, origin REQUEST, note "Advance · {reason}", flagged over limit, request link), balance drops; Loan → L{next} with instalment, origin REQUEST, flagged with existing loan, balance unchanged; Grant → OWNER_GRANT expense in the open month with beneficiary and description, period totals grow; DISBURSED + audit + `DISBURSED` email to every active owner without reference/method; reference required except Cash; future date 422; inactive fund 422; no open month → 409 and still APPROVED; failure mid-way (e.g. forced unique violation) rolls back; second disburse → 409; Idempotency-Key replay returns the same body; fund-short warnings returned; reopen of the month keeps the REQUEST advance
- [x] 7.3 Implement approve/reject/withdraw/disburse in `lib/requests/request-service.ts` (design D4, D9) and `lib/requests/notify.ts` (recipient resolution, dedupe keys, short reason); make 7.1 and 7.2 pass

## 8. Read side — list, detail, timeline, visibility, reminders

- [x] 8.1 Write failing tests `tests/integration/api/requests-read.test.ts`: Super Admin list sections and ordering (overdue first; approved by needed-by; history newest first) and filters (owner/type/status/year; bad filter 422); Owner list `mine` + `paidOut` only; another owner's PENDING detail → 404, DISBURSED detail limited (no method/reference, no decision context); decision context per type (advance before/after + overLimit; loan plan instalment + 24-month check; grant drop + per-owner list; `ABOVE_HOUSE_FUND`; other pending numbers); linked entry labels ("Loan L3", "Expense in October 2026") and `voided` after voiding the advance / cancelling the loan / voiding the expense; timeline order and actors; requester list clears `decision_unseen`; anonymous 401
- [x] 8.2 Write failing tests `tests/integration/api/request-reminders.test.ts`: pending 4 days and approved past needed-by appear in `requestReminders`; `queueRequestReminders` twice → one `REMINDER` row per Super Admin per request and kind; requesters get none
- [x] 8.3 Implement `lib/requests/request-read.ts` (list/detail/timeline from `audit_logs`, SQL visibility mirroring `visibleTo`, linked-entry lookup) and `lib/requests/reminders.ts`; call `queueRequestReminders()` from `scripts/email-worker.ts` each tick; make 8.1 and 8.2 pass

## 9. Attachments for requests (`attachments`, design D7)

- [x] 9.1 Write failing tests `tests/integration/api/request-attachments.test.ts`: Owner presign 201; user with no upload permission 403; owner can't link someone else's upload (422); another owner's PENDING request file → 404 on `/attachments/:id` and `/file`; DISBURSED public file 200, private 404 for other owners, 200 for requester and Super Admin; existing house-transaction / ledger / loan file access unchanged
- [x] 9.2 Allow `request.create` in `app/api/v1/attachments/presign/route.ts`; pass the viewer into `openFile`/`fileMeta` and apply the `money_request` rule; make 9.1 pass

## 10. Email template (`email-outbox`, design D9)

- [x] 10.1 Write failing tests in `lib/email/templates/templates.test.ts`: `REQUEST_UPDATE` renders each event in en and bn, links to `/{locale}/requests?request={id}`, ৳ with lakh grouping and Bangla digits in bn, never contains reference/method/fund account; note only when present in the payload
- [x] 10.2 Add `RequestUpdatePayload` to `lib/email/outbox.ts`, `lib/email/templates/request-update.ts`, the `render.ts` case; make 10.1 pass

## 11. API routes and Swagger (design D12)

- [x] 11.1 Write failing route-level tests (in the files above) for envelope shape, status codes, `await connection()` GETs returning `Cache-Control: no-store`, CSRF on mutations, Idempotency-Key on disburse
- [x] 11.2 Add `app/api/v1/requests/{route.ts,schema.ts}`, `requests/form-context/`, `requests/[id]/`, `requests/[id]/{cancel,approve,reject,withdraw,disburse}/` with zod schemas (`.meta({ id })`) and `ok()`/`failResponse()`; make 11.1 pass
- [x] 11.3 Register every new `schema.ts` in `app/api/v1/openapi.ts`; verify all 10 operations appear in `/api/v1/openapi.json` (and the Swagger UI) and the OpenAPI snapshot/test passes

## 12. i18n

- [x] 12.1 Add every Requests string (PRD §2.1, §9 messages, status/tag labels, timeline items, nav, Home tile, reminders, "From request") to `lib/i18n/en.ts` and `lib/i18n/bn.ts`; the existing key-parity test passes

## 13. Requests UI (`requests-ui`, design D13)

- [x] 13.1 Write failing component tests `components/requests/requests.test.tsx` with fixtures: Owner layout (My requests + Paid out, empty states, no decision buttons); Super Admin layout (decision section only when pending, empty text, approved section, history filters); card tags per status (Overdue, Self-approved, Recorded by, Approved lower, Admin note, Entry voided); disburse button label per type and disabled "Open a month first…" with no open month
- [x] 13.2 Write failing component tests for dialogs: request form (type help texts, plan only for Loan, past date disabled, field errors from §9, live hints incl. owed and pending-exists, Private toggle, 3-file limit); approve (default amount, lower needs note, self-request text, "approve and disburse now" opens disburse); reject/withdraw require reason; disburse (reference required except Cash, instalment pre-filled from plan, fund-short warning, grant month note); cancel goes through `ConfirmDialog`
- [x] 13.3 Implement `app/[lang]/(app)/requests/page.tsx` (server, `Suspense`, `requirePagePermission("request.view")`, filters + `?request=` from `searchParams`, `generateMetadata`) and `components/requests/*` (`RequestsView`, `RequestCard`, `DecisionCard`, `ContextPanel`, `RequestFormDialog`, `ReasonDialog`, `ApproveDialog`, `DisburseDialog`, `RequestDetailSheet`) using shadcn/ui + Heroicons, `apiFetch` + `router.refresh()`, `useDebouncedValue` for the grant hint; make 13.1–13.2 pass
- [x] 13.4 Run the `barihisab-design-system` checklist on the new screens (tokens only, zero radius, one yellow signal, 44px targets, 360px no horizontal scroll)

## 14. Navigation, Home and "From request" tie-ins

- [x] 14.1 Write failing tests: `components/app/shell.test.tsx` (Requests item for `request.view`, badge numbers incl. Bangla digits, hidden at 0); Home tests (Pending requests tile + Review queue link for Super Admin, reminder note, Owner latest open request); Entries drawer for a grant expense shows "From request", Void, no Correct; advances table / loan card / owner statement rows show the request tag
- [x] 14.2 Compute badge counts in `app/[lang]/(app)/layout.tsx` and pass to `ShellNav`; add the Home tile/note in `app/[lang]/(app)/page.tsx` + `HomeDesk`; add a shared `RequestTag` and render it in Entries, Advances, loans and owner statement; make 14.1 pass

## 15. End-to-end (Playwright)

- [x] 15.1 Write `e2e/requests.spec.ts` (sorts after `period-distribution.spec.ts`, before `visual.spec.ts`; `resetRateLimits()` first): Owner submits an Advance with an attachment → Super Admin sees it under Needs your decision with context → approves a lower amount with a note → Owner sees "Approved · awaiting cash" and the admin note, badge clears → Super Admin disburses by bKash → card Disbursed, entry on the owner's statement with "From request" → a second Owner sees it under Paid out to owners
- [x] 15.2 Add flows: Loan request rejected with reason (Owner sees "Admin: …"); Grant approved and disbursed → expense visible in Entries with "From request"; Owner cancels a pending request via the confirm dialog; Owner cannot see Approve/Reject/Disburse and gets 403 from the API; no open month disables Disburse; `/bn/requests` at 360px has Bangla labels and no horizontal scroll
- [x] 15.3 Make the spec state-neutral: void/cancel what it created, leave the current month open; run the whole e2e suite to confirm `visual.spec.ts` and other specs still pass

## 16. Verification and rollout

- [x] 16.1 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:coverage` (pure module 100 %), `pnpm test:int`, `pnpm test:e2e`; fix regressions in existing suites without weakening their assertions
- [ ] 16.2 Manual check on the dev server (`$CONDUCTOR_PORT`) in en and bn, desktop and 360px: full Owner → Super Admin → disburse loop for all three types; screenshot to `.context/`
- [ ] 16.3 Ask the user before applying the migration to the shared dev DB (`prisma migrate deploy`); then re-verify the dev pages
- [x] 16.4 `openspec validate add-requests --strict`; update tasks to done
