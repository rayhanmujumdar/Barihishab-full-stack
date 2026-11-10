## Purpose

Lets every user set, replace and remove their own profile photo, and lets the Super Admin add or change a user's photo when creating or editing them, with photos kept private, validated and shown in place of initials. (Main PRD USR-05; Auth PRD `profile.update.self`, USR-01, USR-06, §4 A6/A7)

## ADDED Requirements

### Requirement: Presigned photo upload
`POST /api/v1/avatars/presign` SHALL accept `{ fileName, mime, size }` from a caller holding at least one of `profile.update.self`, `user.create` or `user.update`, and respond `201 { avatarId, uploadUrl, headers, expiresAt }` with a short-lived presigned PUT to the private bucket. `mime` MUST be one of `image/jpeg`, `image/png`, `image/webp`; any other type (including `application/pdf`) MUST respond `422 VALIDATION_FAILED` with `details.fields.mime`. `size` above 2 MB (2 097 152 bytes) MUST respond `413 FILE_TOO_LARGE`. A caller with none of the three permissions MUST receive `403 FORBIDDEN`; no session MUST receive `401`. The endpoint MUST be rate-limited per user with the same limit as bill presigning and MUST require the CSRF header. The upload is created unlinked and owned by the caller.

#### Scenario: Owner presigns a JPEG photo
- **WHEN** an Owner posts `{ fileName: "me.jpg", mime: "image/jpeg", size: 180000 }`
- **THEN** the response is `201` with an `avatarId` and an `uploadUrl`, and no storage host appears outside `uploadUrl`

#### Scenario: PDF rejected
- **WHEN** a user posts `mime: "application/pdf"`
- **THEN** the response is `422 VALIDATION_FAILED` with `details.fields.mime`

#### Scenario: Photo too large
- **WHEN** a user posts `size: 3000000`
- **THEN** the response is `413 FILE_TOO_LARGE`

### Requirement: Photo verification before use
Before a photo is attached to a user, the system SHALL verify that the `avatarId` refers to an unlinked, non-removed photo upload of the current property that was uploaded by the same caller, that the stored object exists with the declared size (≤ 2 MB), and that its leading bytes match the declared image type. Any failure MUST respond `422 VALIDATION_FAILED` with `details.fields.avatarId` and MUST leave the user's current photo unchanged. A bill/receipt upload id MUST NOT be accepted as an `avatarId`.

#### Scenario: Spoofed type
- **WHEN** a user uploads a file declared `image/png` whose bytes are a PDF and sends its `avatarId`
- **THEN** the response is `422 VALIDATION_FAILED` with `details.fields.avatarId` and the previous photo stays

#### Scenario: Another user's upload
- **WHEN** Owner A sends an `avatarId` that Owner B presigned
- **THEN** the response is `422 VALIDATION_FAILED` with `details.fields.avatarId`

#### Scenario: Upload already used
- **WHEN** a user sends an `avatarId` that is already linked to a user
- **THEN** the response is `422 VALIDATION_FAILED` with `details.fields.avatarId`

### Requirement: Set, replace and remove own photo
`PATCH /api/v1/me` (permission `profile.update.self`) SHALL accept an optional `avatarId`: a uuid sets or replaces the caller's photo, `null` removes it, and omitting it leaves the photo unchanged. Setting, replacing or removing MUST happen in the same database transaction as the rest of the profile update. A replaced or removed photo MUST be soft-removed (marked removed with who and when; the row is never deleted) and MUST stop being served. Each change MUST write one audit row: `user.avatar.updated` (with before/after attachment ids) or `user.avatar.removed`. Owners MUST be able to change their own photo without `profile.identity.self`.

#### Scenario: Owner sets first photo
- **WHEN** an Owner with no photo patches `{ avatarId: <verified upload> }`
- **THEN** the response is `200`, `profile.avatarUrl` is non-null, and an audit row `user.avatar.updated` exists

#### Scenario: Replace photo
- **WHEN** a user with photo P1 patches `{ avatarId: P2 }`
- **THEN** `avatarUrl` points at P2 and requesting P1's file returns `404 NOT_FOUND`

#### Scenario: Remove photo
- **WHEN** a user with a photo patches `{ avatarId: null }`
- **THEN** the response is `200`, `profile.avatarUrl` is `null`, and an audit row `user.avatar.removed` exists

#### Scenario: Photo patch rolls back with a failing field
- **WHEN** a user patches `{ avatarId: <verified upload>, phone: "12345" }`
- **THEN** the response is `422 VALIDATION_FAILED` and neither the phone nor the photo changes

### Requirement: Super Admin sets a user's photo
`POST /api/v1/users` (permission `user.create`) SHALL accept an optional `avatarId` and, when present and verified, attach the photo to the new INVITED user in the same transaction that creates the user and queues the invite. `PATCH /api/v1/users/:id` (permission `user.update`) SHALL accept `avatarId` with the same set/replace/remove semantics as the self endpoint, applied to the target user. A failed photo verification on create MUST respond `422` and MUST NOT create the user or queue an invite. Audit rows MUST name the Super Admin as actor and the target user as entity.

#### Scenario: Create user with photo
- **WHEN** a Super Admin posts a valid new user with a verified `avatarId`
- **THEN** the response is `201`, `user.status` is `INVITED`, and `user.avatarUrl` is non-null

#### Scenario: Create user with bad photo
- **WHEN** a Super Admin posts a valid new user with an `avatarId` that fails verification
- **THEN** the response is `422 VALIDATION_FAILED` with `details.fields.avatarId`, no user is created and no invite email is queued

#### Scenario: Admin removes an Owner's photo
- **WHEN** a Super Admin patches `/users/<owner id>` with `{ avatarId: null }`
- **THEN** the response is `200` and the Owner's `avatarUrl` is `null`

#### Scenario: Owner cannot set another user's photo
- **WHEN** an Owner calls `PATCH /api/v1/users/<other id>` with an `avatarId`
- **THEN** the response is `403 FORBIDDEN`

### Requirement: Photo URL in user responses
Every user object returned by the API (`PublicUser`: `/me`, `/users`, `/users/:id`, auth session payloads) SHALL include `avatarUrl`: the same-origin URL `/api/v1/attachments/<id>/file` of the current photo, or `null` when the user has none. The URL MUST NOT contain the storage host, bucket, object key or a signature. The photo file SHALL be served by the existing same-origin file proxy with its permission, scope and header rules; a removed photo MUST return `404 NOT_FOUND`.

#### Scenario: List shows photo URLs
- **WHEN** a Super Admin lists users and one has a photo
- **THEN** that item's `avatarUrl` starts with `/api/v1/attachments/` and the others are `null`

#### Scenario: Photo served same-origin
- **WHEN** a logged-in Owner requests another user's `avatarUrl`
- **THEN** the response is `200` with `Content-Type` of the stored image type, from the app's own origin

### Requirement: Photo shown with initials fallback
Wherever a user's avatar is shown — the app shell user block, the Users table Person column and the `/me` Profile section — the UI SHALL show the user's photo when `avatarUrl` is set and MUST fall back to the existing initials square when `avatarUrl` is `null` or the image fails to load. Photos MUST render square with zero radius per the design system, and decorative avatars next to a visible name MUST be hidden from assistive technology.

#### Scenario: Photo in the shell
- **WHEN** a user with a photo opens any app page
- **THEN** the shell user block shows their photo instead of initials

#### Scenario: Broken photo falls back
- **WHEN** the photo request fails
- **THEN** the initials square is shown and no broken-image icon appears

### Requirement: Browser-side photo preparation
Before uploading, the browser SHALL accept only JPG, PNG or WebP files, center-crop them to a square, scale them to at most 512 × 512 px and re-encode them as JPEG (which also strips EXIF/GPS metadata). A file of another type, or one still larger than 2 MB after preparation, MUST be rejected in the UI with "Only JPG, PNG or WebP up to 2 MB." without calling the API.

#### Scenario: Large phone photo
- **WHEN** a user picks a 4000 × 3000 px, 6 MB JPEG
- **THEN** the uploaded file is a 512 × 512 JPEG under 2 MB

#### Scenario: Wrong type picked
- **WHEN** a user picks a `.pdf`
- **THEN** the error "Only JPG, PNG or WebP up to 2 MB." is shown and no presign request is sent
