## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Receipts on owner payouts and advances
Payout and advance requests SHALL accept `attachmentIds` (≤ 5) and link them to the created PAYOUT (or, when there is no PAYOUT, the ADVANCE) entry using the same validation as entry attachments (existence, size ≤ 5 MB, magic bytes, unlinked, same property), writing `attachment.added`. Presigning an upload MUST be allowed for users holding `transaction.create`, `payout.create` or `advance.create`. Linked receipts MUST be listed on the statement row and viewable through the same-origin `GET /api/v1/attachments/:id/file` by anyone with `attachment.view`. (Owners PRD F11 receipt photo, F3 row detail)

#### Scenario: Receipt on a payout
- **WHEN** a Super Admin pays an owner with one valid PNG `attachmentId`
- **THEN** the statement row for that PAYOUT lists the file and an Owner can open it through `GET /api/v1/attachments/:id/file`

#### Scenario: Bad file refused
- **WHEN** the attached file declared `image/jpeg` starts with `MZ`
- **THEN** the payout returns `422 VALIDATION_FAILED` and no entry is written

## REMOVED Requirements

### Requirement: Signed viewing
**Reason**: Presigned GET URLs expose the storage host, object key and signature to the browser, act as 5-minute bearer links, and send users out of the app. Replaced by the authenticated same-origin proxy.
**Migration**: Load file bytes from `GET /api/v1/attachments/:id/file` (see "Same-origin file proxy"). `GET /api/v1/attachments/:id` now returns `{ url, mime, fileName }` with a same-origin `url` and no `expiresAt`; clients drop any expiry/refresh logic.
