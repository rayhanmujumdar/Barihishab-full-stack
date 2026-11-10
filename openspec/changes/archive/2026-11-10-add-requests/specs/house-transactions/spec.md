## ADDED Requirements

### Requirement: Special grant expenses from requests
Disbursing an APPROVED GRANT request SHALL create one EXPENSE in the latest OPEN month with category `OWNER_GRANT`, the approved amount, the disburse date and fund account, description "Owner special grant · {Owner} · R-{year}-{nnn}", beneficiary owner set, source `REQUEST_GRANT`, linked to the request (at most one expense per request), and write `transaction.created`. It SHALL count in the month's totals and distributable like any expense. List and detail SHALL expose `beneficiaryOwnerId` and `request: { id, number } | null`. `PATCH /api/v1/transactions/:id` MUST refuse it with `409 NOT_EDITABLE` ("This expense comes from a request and can't be changed here."), while `POST /api/v1/transactions/:id/void` MUST be allowed with a reason (the request then shows "Entry voided"). Category `OWNER_GRANT` stays non-selectable for manual entries. (Requests PRD F7, Rules 13, 14; main PRD §9.3 `beneficiary_owner_id`, `request_id`)

#### Scenario: Grant lowers the distributable
- **WHEN** August's income/expense give a distributable of 9264400 with a 5 % reserve and a grant of 600000 is disbursed in August
- **THEN** August's expenses grow by 600000 and its distributable becomes 8694400

#### Scenario: Correct refused
- **WHEN** a Super Admin patches the grant expense amount
- **THEN** the response is `409 NOT_EDITABLE`

#### Scenario: Void allowed
- **WHEN** a Super Admin voids the grant expense with reason "Paid twice by mistake"
- **THEN** the expense is voided and no longer counts, and the request stays DISBURSED with its entry marked voided
