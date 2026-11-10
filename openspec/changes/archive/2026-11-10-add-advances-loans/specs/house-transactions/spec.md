## ADDED Requirements

### Requirement: Loan write-off expenses are locked
An expense booked by a loan write-off (source `LOAN_WRITE_OFF`) SHALL be listed, totalled and shown in its month like any expense, but `PATCH /api/v1/transactions/:id` and `POST /api/v1/transactions/:id/void` MUST refuse it with `409 NOT_EDITABLE` ("This expense comes from a loan write-off and can't be changed here."), and the Entries detail MUST NOT offer Correct or Void for it. Category `LOAN_WRITTEN_OFF` MUST NOT be selectable for manual entries (`422` on `categoryId`). (Advances & Loans PRD F10)

#### Scenario: Void refused
- **WHEN** a Super Admin voids the "L2 written off" expense from Entries
- **THEN** the response is `409 NOT_EDITABLE` and the expense still counts

#### Scenario: Manual use of the category
- **WHEN** a manual expense is created with category `LOAN_WRITTEN_OFF`
- **THEN** the response is `422` on `categoryId`
