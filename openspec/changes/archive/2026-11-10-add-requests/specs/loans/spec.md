## ADDED Requirements

### Requirement: Loan from a request
Disbursing an APPROVED LOAN request SHALL create one loan inside the disburse transaction with the next loan number, principal = approved amount, the disburse date, fund account, method and reference, reason = the request's reason, the optional instalment, origin `REQUEST`, `isSelf` from the request, `flagged` when the owner already has an ACTIVE loan, linked to the request (at most one loan per request), and write `loan.created`. Loan list, detail and the Owners loan list SHALL expose `origin: "REQUEST"` and `request: { id, number } | null`. Cancelling or writing off such a loan follows the existing rules and leaves the request DISBURSED. (Requests PRD F7, Rule 14; main PRD §9.3 `loans.request_id`)

#### Scenario: Request loan in the list
- **WHEN** R-2026-020 for 2000000 is disbursed with instalment 400000 and L2 is the latest loan
- **THEN** `GET /api/v1/loans` lists L3 with `origin: "REQUEST"`, `installmentPaisa: 400000` and `request.number: "R-2026-020"`

#### Scenario: Cancel a request loan
- **WHEN** L3 from a request (no repayments) is cancelled with a reason
- **THEN** L3 is CANCELLED and the request shows its linked entry as voided
