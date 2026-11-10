## ADDED Requirements

### Requirement: Request email template
The system SHALL provide a `REQUEST_UPDATE` template in `bn` and `en` whose payload holds the event (`SUBMITTED`, `RECORDED`, `EDITED`, `CANCELLED`, `APPROVED`, `SELF_APPROVED`, `REJECTED`, `WITHDRAWN`, `DISBURSED`, `REMINDER`), request number and id, owner name, type, requested and approved amounts in paisa, a short reason (≤ 80 characters), the decision note or reason when the recipient is the requester or a Super Admin, the actor name and, for reminders, the reminder kind (`PENDING_3_DAYS` or `APPROVED_PAST_DUE`). The rendered email MUST link to `/{locale}/requests?request={id}`, format money as ৳ with lakh grouping (Bangla digits in `bn`), and MUST NOT contain any fund account, reference number or payment method. (Requests PRD §10, D16)

#### Scenario: Disbursed email to another owner
- **WHEN** a `DISBURSED` row for an `en` owner who is not the requester is rendered
- **THEN** the email names the requester, type, ৳ amount, short reason and approver, links to the request, and contains no reference number or method

#### Scenario: Bangla approved email
- **WHEN** an `APPROVED` row in `bn` with approved 600000 paisa is rendered
- **THEN** the body is Bangla and shows ৳৬,০০০ with the note
