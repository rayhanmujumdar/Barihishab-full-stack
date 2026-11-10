## Purpose

Lets owners ask the house for an advance, a loan or a special grant in writing, lets the Super Admin decide with full context, and turns a disbursal into exactly one linked entry in the books, with every step traceable.

## ADDED Requirements

### Requirement: Money request record
A money request SHALL hold property, a number unique per property and year, the owner it is for, type (`ADVANCE`, `LOAN`, `GRANT`), requested amount in paisa (> 0), approved amount in paisa (null until approved; 1 ≤ approved ≤ requested), reason (10–500 characters, trimmed), needed-by date, repayment plan (free text ≤ 200, loans only, else null), status (`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, `WITHDRAWN`, `DISBURSED`), `isSelf` (owner linked to the requesting user, who is a Super Admin), created-by user and whether it was recorded on behalf of the owner by someone else, decided-by / decided-at / decision note, and created-at / updated-at. Requests MUST NOT be deleted; the database MUST refuse `DELETE` and amounts outside the CHECKs. Every query MUST be scoped by property. (Requests PRD §3, §4, Rule 1; main PRD `money_requests` §9.4, ADV-03)

#### Scenario: Stored with integer paisa
- **WHEN** an owner submits an Advance of 1000000 paisa
- **THEN** the stored request has `amountRequestedPaisa: 1000000`, `amountApprovedPaisa: null`, status `PENDING`

#### Scenario: Delete refused
- **WHEN** a raw `DELETE FROM money_requests` runs
- **THEN** the database raises and the row remains

#### Scenario: Approved above requested refused by the database
- **WHEN** a raw update sets `amount_approved_paisa` to 1000001 on a request of 1000000
- **THEN** the database raises a CHECK violation

### Requirement: Request numbers
Each new request SHALL get the next number for its property in the Asia/Dhaka calendar year of submission, starting at 1, displayed as `R-{year}-{nnn}` (zero-padded to 3 digits, wider when needed). Numbers MUST NOT be reused, including for cancelled requests, and MUST stay unique under concurrent submissions. (G9)

#### Scenario: Sequential within a year
- **WHEN** R-2026-013 is the last request of 2026 and a new one is submitted on 19 Oct 2026
- **THEN** the new request is R-2026-014

#### Scenario: New year restarts
- **WHEN** the first request of 2027 is submitted
- **THEN** it is R-2027-001

#### Scenario: Concurrent submissions
- **WHEN** two owners submit at the same moment
- **THEN** the two requests get different numbers

### Requirement: Lifecycle transitions
The system SHALL allow only these transitions: PENDING → APPROVED (decide), PENDING → REJECTED (decide), PENDING → CANCELLED (requester), APPROVED → DISBURSED (disburse), APPROVED → CANCELLED (requester), APPROVED → WITHDRAWN (decide). DISBURSED, REJECTED, CANCELLED and WITHDRAWN are final. Any other transition MUST return `409 INVALID_REQUEST_STATUS` and change nothing. Each request write MUST lock the request row so concurrent actions on one request run one after the other. (§4; Rules 3, 8)

#### Scenario: Reject an approved request refused
- **WHEN** the Super Admin rejects an APPROVED request
- **THEN** the response is `409 INVALID_REQUEST_STATUS`

#### Scenario: Cancel after disbursal refused
- **WHEN** the requester cancels a DISBURSED request
- **THEN** the response is `409 INVALID_REQUEST_STATUS` and the request stays DISBURSED

#### Scenario: Double approve race
- **WHEN** two approve calls for one PENDING request arrive at the same time
- **THEN** exactly one succeeds and the other returns `409 INVALID_REQUEST_STATUS`

### Requirement: Submit a request
`POST /api/v1/requests` (permission `request.create`) SHALL create a PENDING request for the owner linked to the signed-in user, with type, `amountPaisa` (100 paisa to 1000000000 — ৳1 to ৳1 crore; approvals start at ৳1), reason (10–500), `neededBy` (today or later in Asia/Dhaka), `repaymentPlan` (loan only, optional) and up to 3 `attachmentIds` (each with an optional private flag). It MUST set `isSelf` when the requester holds `request.decide`. A user with no linked owner MUST get `403 NO_OWNER_PROFILE`. The response MUST be `201` with the request and soft warnings (`PENDING_EXISTS` with the other number, `ADVANCE_OVER_LIMIT`, `OWNER_OWED`, `OWNER_HAS_LOAN`); warnings MUST NOT block. It MUST write audit `request.submitted` and queue the "new request" email to every active Super Admin in the same transaction. Validation messages: amount "Enter an amount greater than zero." (below 100 paisa: "Ask for at least ৳1."), reason "Tell everyone what it is for.", needed-by "Pick today or a later date." (F2, Rules 1, 10; §9; ADV-03; D16)

#### Scenario: Owner asks for an advance
- **WHEN** Nasrin submits Advance 1000000 "Cataract surgery deposit at Ispahani Eye Hospital" needed by 2026-10-30 on 2026-10-19
- **THEN** the response is `201` with number R-2026-014, status PENDING, and one `REQUEST_UPDATE` email row per active Super Admin with event `SUBMITTED`

#### Scenario: Past needed-by refused
- **WHEN** `neededBy` is yesterday
- **THEN** the response is `422` on `neededBy` with "Pick today or a later date." and nothing is written

#### Scenario: Short reason refused
- **WHEN** the reason is "money" (5 characters)
- **THEN** the response is `422` on `reason`

#### Scenario: Second pending request warns
- **WHEN** Tanvir already has PENDING R-2026-015 and submits another request
- **THEN** the new request is created and the warnings include `PENDING_EXISTS` with number R-2026-015

#### Scenario: Repayment plan ignored for non-loans
- **WHEN** an Advance is submitted with a repayment plan
- **THEN** the stored repayment plan is null

#### Scenario: More than three files
- **WHEN** four attachment ids are sent
- **THEN** the response is `422` on `attachmentIds` and nothing is written

### Requirement: Record a request for an owner
A user with `request.record` SHALL be able to send `ownerId` on `POST /api/v1/requests` to create the request for any owner of the property, including owners without a login. The request MUST be marked recorded-on-behalf with the recorder as creator, `isSelf` false unless the owner is the recorder's own, and audit `request.recorded`. When the owner has an active login, a copy email (event `RECORDED`) MUST be queued to them. A user without `request.record` sending `ownerId` of another owner MUST get `403 FORBIDDEN`. (F11, G10)

#### Scenario: Phone request recorded
- **WHEN** the Super Admin records Advance 500000 for Farzana, who has no login
- **THEN** the request is PENDING, shows recorded by the Super Admin on behalf of Farzana, and no email is queued to Farzana

#### Scenario: Owner tries to record for someone else
- **WHEN** an Owner posts a request with another owner's `ownerId`
- **THEN** the response is `403 FORBIDDEN`

### Requirement: Form context
`GET /api/v1/requests/form-context` (permission `request.create`; `ownerId` query only with `request.record`) SHALL return, for the requester's owner (or the given owner): balance in paisa, advance limit and amount used (advance outstanding), active loans with number and outstanding, the latest open month, the grant cost per 10 % share for a given `amountPaisa`, and the owner's PENDING request numbers. (F2 live info, G11, G12)

#### Scenario: Advance hints
- **WHEN** Nasrin (balance −500000, limit 3316300) opens the form
- **THEN** the response has `balancePaisa: -500000`, `advanceLimitPaisa: 3316300`, `advanceUsedPaisa: 500000`

#### Scenario: Owner asks for another owner's context
- **WHEN** an Owner calls with another owner's `ownerId`
- **THEN** the response is `403 FORBIDDEN`

### Requirement: Edit a pending request
`PATCH /api/v1/requests/{id}` (permission `request.create`) SHALL let only the request's creator (or, for a recorded request, the recorder or the owner's linked user) change type, amount, reason, needed-by, repayment plan and attachments while the request is PENDING, with the same validation as submit. Others MUST get `404 NOT_FOUND` (Owners) or `403 FORBIDDEN` (Super Admin on someone else's request). A non-PENDING request MUST return `409 INVALID_REQUEST_STATUS`. It MUST write audit `request.edited` with before/after and queue an `EDITED` email to active Super Admins other than the editor. (F3, G3, Rule 2)

#### Scenario: Lower the amount while pending
- **WHEN** Tanvir edits his PENDING request from 800000 to 700000
- **THEN** the request shows 700000 and the timeline has an "Edited" item

#### Scenario: Edit after approval refused
- **WHEN** the requester edits an APPROVED request
- **THEN** the response is `409 INVALID_REQUEST_STATUS`

### Requirement: Cancel a request
`POST /api/v1/requests/{id}/cancel` (permission `request.create`) SHALL let the requester cancel a PENDING or APPROVED request; status becomes CANCELLED, audit `request.cancelled`, and a `CANCELLED` email is queued to active Super Admins other than the actor. Another owner MUST get `404 NOT_FOUND`. (F3, G4, Rule 3)

#### Scenario: Cancel an approved request
- **WHEN** Tanvir cancels his APPROVED request before payout
- **THEN** the status is CANCELLED and no ledger, loan or expense entry exists for it

### Requirement: Decision context
`GET /api/v1/requests/{id}` for a user with `request.view.all` SHALL include, for PENDING and APPROVED requests, a context block: the owner's balance, loan outstanding, advance limit and used, House Fund total and per fund account, and type-specific data — Advance: limit used before and after this amount and `overLimit`; Loan: active loans with outstanding, the instalment parsed from the plan (first number, Bangla or Latin digits, commas allowed) and whether the loan would finish within 24 months; Grant: the open month, the distributable drop and each owner's share drop computed with the month's reserve rule. Warnings MUST include other PENDING requests of the same owner and `ABOVE_HOUSE_FUND` when the amount exceeds the House Fund. (F4, G7, G12, §11)

#### Scenario: Advance within limit
- **WHEN** the Super Admin opens Nasrin's PENDING Advance of 1000000 (used 500000, limit 3316300)
- **THEN** the context has `advanceUsedAfterPaisa: 1500000` and `overLimit: false`

#### Scenario: Grant effect on shares
- **WHEN** the open month's distributable is 9264400 with a 5 % reserve and a Grant of 600000 is opened
- **THEN** the context shows a distributable drop of 570000 and Nasrin (40 %) losing 228000, Sabrina (10 %) 57000

#### Scenario: Loan plan check
- **WHEN** a Loan of 2000000 has plan "৳4,000 per month from entitlement"
- **THEN** the context has `planInstalmentPaisa: 400000` and `finishesWithin24Months: true`

### Requirement: Approve a request
`POST /api/v1/requests/{id}/approve` (permission `request.decide`) SHALL approve a PENDING request with `amountPaisa` (default the requested amount) between 100 paisa and the requested amount ("Approve between ৳1 and ৳{requested}.") and an optional note (≤ 300) that is required when the amount is lower ("Explain why the amount is lower."). Status becomes APPROVED with decided-by/at, the note, and the requester's unseen-decision flag set. It MUST write audit `request.approved` and queue an `APPROVED` email to the requester's active login; for a self-request it MUST instead queue `SELF_APPROVED` to every owner with an active login. Approval MUST NOT move money. (F5, F10, G2, G15, Rules 4, 6, 11)

#### Scenario: Approve lower with a note
- **WHEN** Tanvir's 800000 Advance is approved at 600000 with note "Reduced — bank balance is low until rent clears"
- **THEN** status is APPROVED, `amountApprovedPaisa: 600000`, no ledger entry exists and Tanvir has an `APPROVED` email queued

#### Scenario: Lower without a note
- **WHEN** approved at 600000 with no note
- **THEN** the response is `422` on `note` with "Explain why the amount is lower."

#### Scenario: Above requested
- **WHEN** approved at 900000 on a request of 800000
- **THEN** the response is `422` on `amountPaisa` with "Approve between ৳1 and ৳8,000."

#### Scenario: Self-approved
- **WHEN** the Super Admin approves their own request
- **THEN** the request is tagged Self-approved and every owner with an active login has a `SELF_APPROVED` email queued

### Requirement: Reject a request
`POST /api/v1/requests/{id}/reject` (permission `request.decide`) SHALL reject a PENDING request with a required reason (1–300; "Please write a reason — {Owner} will see it."). Status REJECTED, reason stored as the decision note, audit `request.rejected`, `REJECTED` email to the requester's active login. (F6, Rule 5)

#### Scenario: Rejected with reason
- **WHEN** Tanvir's Loan of 2000000 is rejected with "Existing loan L2 still has ৳40,000 outstanding"
- **THEN** status is REJECTED and the request's decision note is that reason

#### Scenario: Empty reason
- **WHEN** reject is sent with a blank reason
- **THEN** the response is `422` on `reason`

### Requirement: Withdraw an approval
`POST /api/v1/requests/{id}/withdraw` (permission `request.decide`) SHALL move an APPROVED request to WITHDRAWN with a required reason (1–300), audit `request.withdrawn`, `WITHDRAWN` email to the requester's active login. (F8, G4)

#### Scenario: Fund ran short
- **WHEN** an APPROVED request is withdrawn with "House Fund ran short this month"
- **THEN** status is WITHDRAWN with that reason and nothing was paid

### Requirement: Disburse a request
`POST /api/v1/requests/{id}/disburse` (permission `request.disburse`, `Idempotency-Key` honoured) SHALL pay out an APPROVED request with `date` (not after today), `fundAccountId` (active), `method` (`CASH`, `BANK`, `BKASH`, `NAGAD`), `referenceNo` (required except Cash) and, for loans, `installmentPaisa` (optional, > 0, ≤ approved amount). In one transaction with the latest OPEN month locked it MUST create exactly one entry for the approved amount, linked to the request: ADVANCE → owner-ledger ADVANCE entry, note "Advance · {reason}", origin `REQUEST`, flagged when above the advance limit; LOAN → a new loan with the next number, the instalment, reason = request reason, origin `REQUEST`, flagged when the owner already has an ACTIVE loan; GRANT → an EXPENSE in category `OWNER_GRANT`, description "Owner special grant · {Owner} · R-…", beneficiary the owner, source `REQUEST_GRANT`. `isSelf` on the entry MUST follow the request. The request becomes DISBURSED, audit `request.disbursed` (date, method, reference, entry id), and a `DISBURSED` email (owner, type, amount, short reason ≤ 80 characters, approved-by; no reference or account details) is queued to every owner with an active login. With no OPEN month the response MUST be `409 NO_OPEN_PERIOD` ("Open a month first — payouts are recorded in an open month."). If any step fails nothing is written and the request stays APPROVED. A second disburse MUST return `409 INVALID_REQUEST_STATUS`, and the database MUST hold at most one ledger entry, loan and expense per request. Fund-short and House-Fund-short warnings MUST be returned but never block. (F7, G1, G13, Rules 6, 7, 13; ADV-05)

#### Scenario: Advance disbursed by bKash
- **WHEN** Tanvir's request approved at 600000 is disbursed on 2026-10-26 via BKASH with reference "TrxID 8K2"
- **THEN** Tanvir's statement has an ADVANCE −600000 linked to the request, his balance drops by 600000, the request is DISBURSED and every active owner has a `DISBURSED` email queued

#### Scenario: Loan disbursed with instalment
- **WHEN** a Loan approved at 2000000 is disbursed with `installmentPaisa: 400000` and L2 is the latest loan
- **THEN** loan L3 exists with principal 2000000, instalment 400000, origin `REQUEST`, linked to the request, and the owner's balance is unchanged

#### Scenario: Grant books an expense
- **WHEN** Sabrina's Grant approved at 600000 is disbursed in open August 2026
- **THEN** an August EXPENSE of 600000 "Owner special grant · Sabrina Ahmed · R-2026-009" with beneficiary Sabrina exists and August's distributable drops

#### Scenario: No open month
- **WHEN** every month is CLOSED
- **THEN** the response is `409 NO_OPEN_PERIOD` and the request stays APPROVED

#### Scenario: Disburse twice
- **WHEN** a DISBURSED request is disbursed again with a new Idempotency-Key
- **THEN** the response is `409 INVALID_REQUEST_STATUS` and no second entry exists

#### Scenario: Reference required except Cash
- **WHEN** method is BANK and `referenceNo` is empty
- **THEN** the response is `422` on `referenceNo`

### Requirement: Visibility
`GET /api/v1/requests` and `GET /api/v1/requests/{id}` (permission `request.view`) SHALL return every request to users with `request.view.all`. Other users MUST see their own requests (owner linked to them, or created by them) in every status, and other owners' requests only when DISBURSED, limited to number, owner, type, approved amount, reason, disbursed date, approved-by, the Self-approved tag (every owner is told about self-approvals, G15) and non-private attachments — never the asked amount, asked or needed-by dates, decision note or the submitted/recorded timeline items. Emails to other owners MUST carry the approved amount only. Another owner's non-disbursed request MUST return `404 NOT_FOUND`. Decision context MUST only be returned with `request.view.all`. (F12, G6, Rule 12, §5)

#### Scenario: Owner sees paid-out requests of others
- **WHEN** Nasrin lists requests and Sabrina has one DISBURSED and one PENDING request
- **THEN** Nasrin sees Sabrina's DISBURSED request in the paid-out list and not the PENDING one

#### Scenario: Direct link to someone else's pending request
- **WHEN** Nasrin requests `GET /api/v1/requests/{id}` of Tanvir's PENDING request
- **THEN** the response is `404 NOT_FOUND`

#### Scenario: Owner cannot decide
- **WHEN** an Owner calls approve, reject, withdraw or disburse
- **THEN** the response is `403 FORBIDDEN`

### Requirement: Request list
`GET /api/v1/requests` SHALL return, scoped by the visibility rule: for `request.view.all` — `pending` (overdue first, then needed-by ascending), `approved` (needed-by ascending) and `history` (DISBURSED/REJECTED/CANCELLED/WITHDRAWN, newest decision first) filtered by optional `ownerId`, `type`, `status`, `year`; for others — `mine` (newest first) and `paidOut` (all DISBURSED, newest first). Each item MUST carry number, owner, type, amounts, reason, needed-by, asked date, status, tags (`overdue` = PENDING past needed-by, `selfApproved`, `recordedBy`, `unseen`), decision note and the linked entry summary. `history` and `paidOut` MUST be capped at `limit` (default 50, max 500) with `historyMore` / `paidOutMore`. Reading the list MUST NOT change data; `POST /api/v1/requests/seen` (permission `request.view`) clears the caller's unseen-decision flags. (F1, F12)

#### Scenario: Overdue first
- **WHEN** two PENDING requests need 2026-10-30 and 2026-10-15 and today is 2026-10-20
- **THEN** the 2026-10-15 request comes first with `overdue: true`

#### Scenario: Seen only on request
- **WHEN** an owner with an approved request reads `GET /api/v1/requests` and then posts `/requests/seen`
- **THEN** the read leaves the badge count at 1 and the post brings it to 0

#### Scenario: History is paged
- **WHEN** 60 decided requests exist and the Super Admin lists without `limit`
- **THEN** `history` has 50 items and `historyMore` is true

#### Scenario: Filter history by type
- **WHEN** the Super Admin lists with `type=GRANT&year=2026`
- **THEN** history contains only 2026 grants

### Requirement: Detail and timeline
`GET /api/v1/requests/{id}` SHALL return all visible fields, attachments, the linked entry (`{ kind: "ADVANCE" | "LOAN" | "EXPENSE", id, label, voided }` — label e.g. "Loan L3", "Expense in October 2026"), and a timeline of Submitted / Recorded, Edited, Approved (amount, note), Rejected (reason), Withdrawn (reason), Cancelled, Disbursed (date, method, reference) items, each with actor name and time, oldest first, built from the audit log. `voided` MUST be true when the linked ledger entry or expense is voided or the loan is CANCELLED, shown as "Entry voided"; the request status stays DISBURSED. Other owners viewing a DISBURSED request MUST NOT see method or reference in the timeline. (F9, Rules 14, 15)

#### Scenario: Linked loan
- **WHEN** a disbursed Loan request is opened
- **THEN** `linkedEntry` is `{ kind: "LOAN", label: "Loan L3", voided: false }`

#### Scenario: Entry voided
- **WHEN** the advance created by a request is voided from the owner's statement
- **THEN** the request is still DISBURSED and `linkedEntry.voided` is true

#### Scenario: Timeline order
- **WHEN** a request was submitted, edited, approved and disbursed
- **THEN** the timeline lists those four items in that order with actor and time

### Requirement: Reminders
The system SHALL compute Super Admin reminders on read: PENDING requests asked more than 3 days ago, and APPROVED requests past their needed-by date. The email worker loop SHALL queue one `REMINDER` email per request and reason to each active Super Admin, deduplicated so each is sent once. Requesters MUST NOT receive reminders. (F13, G14)

#### Scenario: Pending for four days
- **WHEN** a request asked on 2026-10-15 is still PENDING on 2026-10-19
- **THEN** it appears in the reminders and exactly one `REMINDER` email per Super Admin is queued across repeated worker runs

### Requirement: Request emails
Every event in Requests PRD §10 SHALL queue a `REQUEST_UPDATE` outbox row in the same transaction as the change, to the listed recipients with an active login, in each recipient's locale, deduplicated per request, event and recipient: `SUBMITTED`, `EDITED`, `CANCELLED`, `REMINDER` → Super Admins; `APPROVED`, `REJECTED`, `WITHDRAWN`, `RECORDED` → the requester owner; `SELF_APPROVED`, `DISBURSED` → every owner. Emails to anyone other than the requester and Super Admins MUST contain only the short reason. No email MUST include an account number, reference or method. The actor is not emailed about their own action. (§10, D16)

#### Scenario: Rejection email in Bangla
- **WHEN** a `bn` owner's request is rejected
- **THEN** one `REQUEST_UPDATE` row in locale `bn` with event `REJECTED` and the reason is queued to that owner

### Requirement: Request audit trail
Every request write SHALL write one audit row (`request.submitted`, `request.recorded`, `request.edited`, `request.cancelled`, `request.approved`, `request.rejected`, `request.withdrawn`, `request.disbursed`) with entity type `money_request`, before/after and reason in the same transaction. These actions are financial (visible with `audit.view.financial`). (Rule 15)

#### Scenario: Approve audited
- **WHEN** a request is approved
- **THEN** one `request.approved` audit row with the approved amount and note exists
