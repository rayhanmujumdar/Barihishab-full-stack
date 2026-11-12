# attachments Specification

## Purpose

Lets the Super Admin attach bill and receipt photos or PDFs to an entry and lets every owner view them, keeping files private, validated and auditable. (Income & Expenses PRD §2.3 G6, §6.3, ATT-01..03, §13 Files)

## Requirements

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

### Requirement: Linking validates the stored file
Attachments SHALL be linked to an entry either in the create body (`attachmentIds`) or via `POST /api/v1/transactions/:id/attachments` `{ attachmentIds }` (permission `transaction.update`, entry not voided, period Open). Before linking, the server MUST confirm each object exists, its stored size matches and is ≤ 5 MB, and its leading bytes match the declared type (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF....WEBP`, PDF `%PDF`); mismatches return `422 VALIDATION_FAILED` and nothing is linked. Only unlinked uploads presigned within this property may be linked. An entry MUST NOT exceed 5 non-removed attachments (`422 TOO_MANY_ATTACHMENTS`). Each link writes `attachment.added` with the file name. (ATT-01, ATT-03)

#### Scenario: Renamed executable
- **WHEN** a file declared `image/jpeg` starts with `MZ`
- **THEN** linking returns `422 VALIDATION_FAILED` (IE-20)

#### Scenario: Sixth file
- **WHEN** an entry already has 5 attachments and one more is linked
- **THEN** the response is `422 TOO_MANY_ATTACHMENTS`

#### Scenario: Add after save
- **WHEN** a Super Admin links a receipt to an existing entry in an Open month
- **THEN** the response is `200` and the entry's `attachmentCount` is 1 higher

### Requirement: Soft removal
`DELETE /api/v1/transactions/:id/attachments/:attId` (permission `transaction.update`) SHALL set `removedAt` / `removedBy` on the attachment (the stored object is kept), write `attachment.removed`, and return `204`. It MUST return `409 PERIOD_CLOSED` for a Closed period and `409 ALREADY_VOIDED` for a voided entry. Files MUST NOT be replaced in place. (ATT-02)

#### Scenario: Remove a wrong photo
- **WHEN** a Super Admin removes an attachment in an Open month
- **THEN** it disappears from the detail and an `attachment.removed` audit row names the file

### Requirement: Same-origin file proxy
`GET /api/v1/attachments/:id/file` (permission `attachment.view`) SHALL stream the stored object of a linked, non-removed attachment of the current property from the private bucket through the application server, so the browser loads the file from the application's own origin. The response MUST NOT redirect to, embed or otherwise expose the storage host, bucket name, object key or any storage signature. Unknown ids, malformed ids, unlinked, removed or other-property attachments MUST return `404 NOT_FOUND` (JSON error envelope); a missing session MUST return `401`; a user without `attachment.view` MUST return `403 FORBIDDEN`. When the stored object is missing or storage fails, the endpoint MUST return a JSON error (`404 NOT_FOUND` for a missing object, `500 INTERNAL_ERROR` otherwise) without leaking storage error details. (ATT-02, §13 Files)

#### Scenario: Owner views a bill image from the app domain
- **WHEN** an Owner requests `GET /api/v1/attachments/<id>/file` for a linked PNG on the app at `http://localhost:3000`
- **THEN** the response is `200` with the file bytes, served from `http://localhost:3000`, and no response header or body contains the storage host or object key

#### Scenario: Removed attachment
- **WHEN** a removed attachment's file is requested
- **THEN** the response is `404 NOT_FOUND`

#### Scenario: Another property's file
- **WHEN** a user requests the file of an attachment that belongs to a different property
- **THEN** the response is `404 NOT_FOUND`

#### Scenario: Not signed in
- **WHEN** the file is requested without a valid session cookie
- **THEN** the response is `401` and no file bytes are sent

#### Scenario: Object gone from the bucket
- **WHEN** the attachment row is linked but its object no longer exists in storage
- **THEN** the response is `404 NOT_FOUND` with the standard error envelope

### Requirement: Safe file response headers
Proxied file responses SHALL set `Content-Type` to the attachment's stored, magic-byte-validated mime (never a type reported by storage), `Content-Length` to the object size, `Content-Disposition: inline` with the original file name (ASCII fallback plus RFC 5987 `filename*`), `X-Content-Type-Options: nosniff`, a `Content-Security-Policy` that forbids scripts, `Cache-Control: private, max-age=300` and an `ETag`. With `?download=1` the disposition MUST be `attachment` with the same file name. A request whose `If-None-Match` matches the current `ETag` MUST return `304 Not Modified` with no body (after the same permission and scope checks). (ATT-02)

#### Scenario: Inline PDF
- **WHEN** a linked PDF named `desco-oct.pdf` is requested
- **THEN** `Content-Type` is `application/pdf`, `Content-Disposition` is `inline; filename="desco-oct.pdf"; …` and `X-Content-Type-Options` is `nosniff`

#### Scenario: Download
- **WHEN** the same file is requested with `?download=1`
- **THEN** `Content-Disposition` starts with `attachment;` and names `desco-oct.pdf`

#### Scenario: Bangla file name
- **WHEN** the file name is `বিদ্যুৎ-বিল.jpg`
- **THEN** `Content-Disposition` carries an ASCII-safe `filename` and `filename*=UTF-8''` with the percent-encoded Bangla name

#### Scenario: Cached copy still valid
- **WHEN** the browser re-requests a file with `If-None-Match` equal to the previous `ETag`
- **THEN** the response is `304 Not Modified` with an empty body

### Requirement: Attachment view metadata
`GET /api/v1/attachments/:id` (permission `attachment.view`) SHALL return `200 { url, mime, fileName }` for linked, non-removed attachments of this property, where `url` is the same-origin path `/api/v1/attachments/:id/file`; otherwise `404 NOT_FOUND`. The response MUST NOT contain a storage URL or an expiry. Responses MUST carry `Cache-Control: no-store`. (ATT-02, PRD §11 `GET /attachments/:id`)

#### Scenario: Owner asks for a bill
- **WHEN** an Owner requests a linked attachment's metadata
- **THEN** the response is `200` with `url` equal to `/api/v1/attachments/<id>/file`, plus `mime` and `fileName`

#### Scenario: Removed attachment metadata
- **WHEN** a removed attachment is requested
- **THEN** the response is `404 NOT_FOUND`

### Requirement: Client-side image compression
Before upload the UI SHALL downscale JPG/PNG/WebP images to at most 2000 px on the longer side and re-encode at about 80 % quality, which also drops EXIF metadata including GPS. PDFs are uploaded unchanged. Files still over 5 MB after compression MUST be refused in the UI with "Only JPG, PNG, WebP or PDF up to 5 MB."

#### Scenario: Large phone photo
- **WHEN** a 4032×3024 JPEG is attached
- **THEN** the uploaded file is at most 2000 px wide

### Requirement: Receipts on owner payouts and advances
Payout and advance requests SHALL accept `attachmentIds` (≤ 5) and link them to the created PAYOUT (or, when there is no PAYOUT, the ADVANCE) entry using the same validation as entry attachments (existence, size ≤ 5 MB, magic bytes, unlinked, same property), writing `attachment.added`. Presigning an upload MUST be allowed for users holding `transaction.create`, `payout.create`, `advance.create` or `request.create`. Linked receipts MUST be listed on the statement row and viewable through the same-origin `GET /api/v1/attachments/:id/file` by anyone with `attachment.view`. (Owners PRD F11 receipt photo, F3 row detail)

#### Scenario: Receipt on a payout
- **WHEN** a Super Admin pays an owner with one valid PNG `attachmentId`
- **THEN** the statement row for that PAYOUT lists the file and an Owner can open it through `GET /api/v1/attachments/:id/file`

#### Scenario: Bad file refused
- **WHEN** the attached file declared `image/jpeg` starts with `MZ`
- **THEN** the payout returns `422 VALIDATION_FAILED` and no entry is written

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

### Requirement: Notice and complaint attachments
Notices SHALL accept up to 5 attachments (entity type `notice`), complaints up to 5 (`complaint`) and comments up to 3 (`complaint_comment`), all JPG, PNG, WebP or PDF ≤ 5 MB with the same upload validation as entry attachments. Presign SHALL also be allowed with `notice.manage` or `complaint.create`; a non-Super-Admin MUST only link their own unlinked uploads. File metadata and file access MUST, in addition to the existing checks, return `404 NOT_FOUND` unless: for `notice` the viewer holds `notice.view`; for `complaint` and `complaint_comment` the viewer can see the complaint and, for a comment file, the comment is not hidden. (Notices & Complaints PRD G3, G8, Rule 17)

#### Scenario: Private complaint file hidden
- **WHEN** Farzana opens a file of Tanvir's Admin-only complaint
- **THEN** the response is `404 NOT_FOUND`

#### Scenario: Owner attaches to a complaint
- **WHEN** an Owner presigns a PDF and raises a complaint with it
- **THEN** the complaint has one attachment and every member who can see the complaint can open it

#### Scenario: Hidden comment file
- **WHEN** a comment with a photo is hidden by the Super Admin
- **THEN** opening that photo returns `404 NOT_FOUND`
