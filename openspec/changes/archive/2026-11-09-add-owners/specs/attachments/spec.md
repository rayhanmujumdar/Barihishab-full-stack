## ADDED Requirements

### Requirement: Receipts on owner payouts and advances
Payout and advance requests SHALL accept `attachmentIds` (≤ 5) and link them to the created PAYOUT (or, when there is no PAYOUT, the ADVANCE) entry using the same validation as entry attachments (existence, size ≤ 5 MB, magic bytes, unlinked, same property), writing `attachment.added`. Presigning an upload MUST be allowed for users holding `transaction.create`, `payout.create` or `advance.create`. Linked receipts MUST be listed on the statement row and viewable through `GET /api/v1/attachments/:id` by anyone with `attachment.view`. (Owners PRD F11 receipt photo, F3 row detail)

#### Scenario: Receipt on a payout
- **WHEN** a Super Admin pays an owner with one valid PNG `attachmentId`
- **THEN** the statement row for that PAYOUT lists the file and an Owner can open it through `GET /attachments/:id`

#### Scenario: Bad file refused
- **WHEN** the attached file declared `image/jpeg` starts with `MZ`
- **THEN** the payout returns `422 VALIDATION_FAILED` and no entry is written
