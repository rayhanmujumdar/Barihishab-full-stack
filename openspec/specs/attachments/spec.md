# attachments Specification

## Purpose

Lets the Super Admin attach bill and receipt photos or PDFs to an entry and lets every owner view them, keeping files private, validated and auditable. (Income & Expenses PRD §2.3 G6, §6.3, ATT-01..03, §13 Files)

## Requirements

### Requirement: Presigned upload to private storage
`POST /api/v1/attachments/presign` (permission `transaction.create`) with `{ fileName (1–200 chars), mime, size }` SHALL return `201 { attachmentId, uploadUrl, headers, expiresAt }` where `uploadUrl` is a presigned PUT to a private S3-compatible bucket valid for 5 minutes and bound to the declared content type and length. `mime` MUST be one of `image/jpeg`, `image/png`, `image/webp`, `application/pdf`, else `422 VALIDATION_FAILED`; `size` over 5,242,880 bytes MUST return `413 FILE_TOO_LARGE`. The object key MUST be server-generated and never derived from the file name. The bucket MUST NOT be publicly readable. (ATT-01, ATT-02)

#### Scenario: Valid PDF
- **WHEN** a Super Admin presigns `{ fileName: "desco-oct.pdf", mime: "application/pdf", size: 240000 }`
- **THEN** the response is `201` with a PUT URL and an unlinked attachment id

#### Scenario: Too big
- **WHEN** `size` is 6000000
- **THEN** the response is `413 FILE_TOO_LARGE`

#### Scenario: Owner cannot upload
- **WHEN** an Owner calls presign
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

### Requirement: Signed viewing
`GET /api/v1/attachments/:id` (permission `attachment.view`) SHALL return `{ url, mime, fileName, expiresAt }` with a presigned GET URL valid for 5 minutes, for linked, non-removed attachments of this property only; otherwise `404 NOT_FOUND`. PDFs MUST be served with `Content-Disposition: inline`. (ATT-02)

#### Scenario: Owner views a bill
- **WHEN** an Owner requests a linked attachment
- **THEN** the response is `200` with a URL that expires 5 minutes later

#### Scenario: Removed attachment
- **WHEN** a removed attachment is requested
- **THEN** the response is `404 NOT_FOUND`

### Requirement: Client-side image compression
Before upload the UI SHALL downscale JPG/PNG/WebP images to at most 2000 px on the longer side and re-encode at about 80 % quality, which also drops EXIF metadata including GPS. PDFs are uploaded unchanged. Files still over 5 MB after compression MUST be refused in the UI with "Only JPG, PNG, WebP or PDF up to 5 MB."

#### Scenario: Large phone photo
- **WHEN** a 4032×3024 JPEG is attached
- **THEN** the uploaded file is at most 2000 px wide
