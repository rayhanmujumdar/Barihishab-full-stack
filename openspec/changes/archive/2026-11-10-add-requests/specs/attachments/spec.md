## MODIFIED Requirements

### Requirement: Presigned upload to private storage
`POST /api/v1/attachments/presign` (any of `transaction.create`, `payout.create`, `advance.create`, `request.create`) with `{ fileName (1–200 chars), mime, size }` SHALL return `201 { attachmentId, uploadUrl, headers, expiresAt }` where `uploadUrl` is a presigned PUT to a private S3-compatible bucket valid for 5 minutes and bound to the declared content type and length. `mime` MUST be one of `image/jpeg`, `image/png`, `image/webp`, `application/pdf`, else `422 VALIDATION_FAILED`; `size` over 5,242,880 bytes MUST return `413 FILE_TOO_LARGE`. The object key MUST be server-generated and never derived from the file name. The bucket MUST NOT be publicly readable. (ATT-01, ATT-02; Requests PRD F15)

#### Scenario: Valid PDF
- **WHEN** a Super Admin presigns `{ fileName: "desco-oct.pdf", mime: "application/pdf", size: 240000 }`
- **THEN** the response is `201` with a PUT URL and an unlinked attachment id

#### Scenario: Too big
- **WHEN** `size` is 6000000
- **THEN** the response is `413 FILE_TOO_LARGE`

#### Scenario: Owner uploads for a request
- **WHEN** an Owner (holding `request.create`) presigns a 300000-byte JPEG
- **THEN** the response is `201` with an unlinked attachment id

#### Scenario: User without any upload permission
- **WHEN** a user holding none of the four permissions calls presign
- **THEN** the response is `403 FORBIDDEN`

### Requirement: Receipts on owner payouts and advances
Payout and advance requests SHALL accept `attachmentIds` (≤ 5) and link them to the created PAYOUT (or, when there is no PAYOUT, the ADVANCE) entry using the same validation as entry attachments (existence, size ≤ 5 MB, magic bytes, unlinked, same property), writing `attachment.added`. Presigning an upload MUST be allowed for users holding `transaction.create`, `payout.create`, `advance.create` or `request.create`. Linked receipts MUST be listed on the statement row and viewable through the same-origin `GET /api/v1/attachments/:id/file` by anyone with `attachment.view`. (Owners PRD F11 receipt photo, F3 row detail)

#### Scenario: Receipt on a payout
- **WHEN** a Super Admin pays an owner with one valid PNG `attachmentId`
- **THEN** the statement row for that PAYOUT lists the file and an Owner can open it through `GET /api/v1/attachments/:id/file`

#### Scenario: Bad file refused
- **WHEN** the attached file declared `image/jpeg` starts with `MZ`
- **THEN** the payout returns `422 VALIDATION_FAILED` and no entry is written

## ADDED Requirements

### Requirement: Request attachments
A money request SHALL accept up to 3 attachments (JPG, PNG, WebP or PDF, ≤ 5 MB each, same validation as entry attachments), each with a `private` flag, linked with entity type `money_request`; editing a PENDING request SHALL allow adding or removing files within the limit. A non-Super-Admin MUST only be able to link their own unlinked uploads. `GET /api/v1/attachments/:id` and `GET /api/v1/attachments/:id/file` for a `money_request` attachment MUST, in addition to the existing checks, return `404 NOT_FOUND` unless the viewer holds `request.view.all`, is the request's owner or creator, or the request is DISBURSED and the file is not private. (Requests PRD F15, G8, Rule 12)

#### Scenario: Pending request file hidden from other owners
- **WHEN** Tanvir opens the file of Nasrin's PENDING request
- **THEN** the response is `404 NOT_FOUND`

#### Scenario: Paid-out file visible unless private
- **WHEN** Nasrin's request is DISBURSED with one public and one private file and Tanvir opens both
- **THEN** the public file returns `200` and the private one `404 NOT_FOUND`

#### Scenario: Four files refused
- **WHEN** a request is submitted with four attachment ids
- **THEN** the response is `422` on `attachmentIds`
