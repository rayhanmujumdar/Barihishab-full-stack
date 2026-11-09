## Why

Clicking a bill/receipt thumbnail today opens a new browser tab at the raw presigned S3 URL (`https://<bucket-host>/<key>?X-Amz-Signature=…`). That leaks the storage host and object key to the user, breaks after 5 minutes, needs a Safari `window.open` workaround, and throws the user out of the app. Files should be served from the app's own origin (e.g. `http://localhost:3000/api/v1/attachments/:id/file`) while the bytes still come from the private bucket, and images should open in an in-app lightbox instead of a new tab.

## What Changes

- **New same-origin file endpoint** `GET /api/v1/attachments/:id/file` (permission `attachment.view`) that streams the object from the private bucket through the Next.js server — a reverse proxy. The browser only ever sees the app's domain; the S3 host, key and signature never reach the client.
- Proxy responses set `Content-Type` from the stored (magic-byte-validated) mime, `Content-Disposition: inline` (or `attachment` with `?download=1`), `X-Content-Type-Options: nosniff`, a restrictive CSP, `Cache-Control: private` and an `ETag` with `304 Not Modified` support.
- **BREAKING (internal API)** `GET /api/v1/attachments/:id` stops returning a presigned S3 URL. It returns `{ url, mime, fileName }` where `url` is the same-origin proxy path; `expiresAt` is removed (the URL no longer expires — access is checked on every request). Only first-party clients consume this endpoint.
- `Storage` interface: add a streaming `get(key)`; remove `presignGet` (no longer used). Uploads keep using presigned PUTs (unchanged).
- **New in-app viewer** using the `yet-another-react-lightbox` npm package (Zoom, Counter, Download plugins), themed to the design system (ink-on-paper, zero radius) and labelled in Bangla/English.
  - Entry detail drawer → **Bills & receipts**: tapping an image thumbnail opens the lightbox at that image; prev/next moves through the entry's images.
  - Owner statement row detail → receipt files: tapping an image opens the same lightbox.
  - PDFs keep opening in a new tab (per PRD §6.3 "PDFs open in a new tab"), but now at the same-origin proxy URL via a plain link — no S3 URL, no `window.open` workaround.
- Client drops the signed-URL cache (`signedAttachmentQuery`, `isFreshSignedUrl`, `SignedUrl`); thumbnails and lightbox slides use the proxy URL built from the attachment id.

## Capabilities

### New Capabilities
- `attachment-viewer`: In-app lightbox for viewing bill/receipt images on every screen that lists attachments (entry detail, owner statement row detail), plus PDF handling, keyboard/touch behaviour, i18n and theming.

### Modified Capabilities
- `attachments`: "Signed viewing" is replaced by proxied, same-origin viewing — new `GET /attachments/:id/file` stream endpoint and a changed `GET /attachments/:id` response (no presigned S3 URL, no `expiresAt`).
- `entries-ui`: "Detail drawer and void dialog" — Bills & receipts thumbnails open the in-app lightbox (images) or the same-origin URL in a new tab (PDFs) instead of a 5-minute signed URL.

## PRD coverage

- Income & Expenses PRD §6.3 Detail drawer ("tap → full view … PDFs open in a new tab"), ATT-02 (private storage, view access), §13 Files, API table row `GET /attachments/:id`.
- Owners PRD F3 row detail (receipt files), F11 receipt photo.
- Main PRD §11 Files (`GET /attachments/:id`), §13 security row "Files".
- **PRD conflict (flagged):** ATT-02 / §13 specify "view via 5-minute signed URL". This change replaces the browser-facing signed URL with an authenticated same-origin proxy. Privacy intent of ATT-02 (private bucket, access-checked viewing) is kept and strengthened — every byte request is permission-checked instead of a bearer link valid for 5 minutes. See design.md for the deviation note.

## Out of scope

- Upload path — browsers still PUT directly to S3 with a presigned URL (ATT-01 unchanged).
- Server-side thumbnail generation / image resizing; thumbnails still load the full (client-compressed ≤ 2000 px) image.
- HTTP `Range` requests / partial content (files are ≤ 5 MB).
- Rendering PDFs inside the lightbox.
- CDN / edge caching of files, and a custom storage domain (e.g. `files.example.com` CNAME to the bucket).
- Attachments on other entities (complaints etc.) that have no UI yet.

## Impact

- **API:** new `app/api/v1/attachments/[id]/file/route.ts` + `schema.ts`; changed `app/api/v1/attachments/[id]/route.ts` + `schema.ts`; register in `app/api/v1/openapi.ts`.
- **Server libs:** `lib/storage/index.ts` (add `get`, drop `presignGet`), `lib/attachments/attachment-service.ts` (`viewUrl` → `fileMeta` / `openFile`), `tests/helpers/fake-storage.ts`.
- **Client:** `components/entries/DetailDrawer.tsx`, `components/owners/StatementTable.tsx`, new `components/attachments/AttachmentLightbox.tsx`, `lib/api/query.ts` (remove signed-URL helpers, add `attachmentFileUrl`), `lib/i18n/en.ts` + `bn.ts`, `app/globals.css` (lightbox theme).
- **Dependency:** `yet-another-react-lightbox` (^3.33, React 19 compatible).
- **Infra:** the Next.js server now carries file bytes (≤ 5 MB each); the bucket no longer needs CORS for `GET` (still needed for `PUT`). `S3_PUBLIC_ENDPOINT` is only used for upload URLs.
- **Tests:** `tests/integration/api/attachments.test.ts`, `openapi.test.ts`, `components/entries/drawers.test.tsx`, owner statement tests, e2e `income-expenses.spec.ts`.
