## 1. Setup

- [x] 1.1 `pnpm add yet-another-react-lightbox` (^3.33); confirm React 19 peer range resolves without warnings
- [x] 1.2 Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (Streaming section) and the barihisab-design-system skill before writing route/UI code

## 2. Storage layer (TDD)

- [x] 2.1 Write failing tests in `tests/helpers/fake-storage.ts` consumers for `storage().get(key)` → `{ body, size, etag }` and `null` for a missing key, and `head()` now returning `etag`
- [x] 2.2 Add `get` to the `Storage` interface and `s3Storage()` (server client, `GetObjectCommand`, `NoSuchKey`/404 → `null`, body via `transformToWebStream()`); extend `head` with `ETag`
- [x] 2.3 Implement `get`/etag in the fake storage (etag = sha1 of bytes; option to force an error for the 500 path)
- [x] 2.4 Move `contentDisposition()` into a shared helper with an `inline | attachment` mode; unit-test ASCII fallback + `filename*` for a Bangla file name

## 3. Same-origin file proxy endpoint (TDD) — attachments spec "Same-origin file proxy", "Safe file response headers"

- [x] 3.1 Write failing integration tests in `tests/integration/api/attachments.test.ts` for `GET /api/v1/attachments/:id/file`: Owner gets 200 + exact bytes; body/headers contain no storage host or key; 404 for malformed id, unknown, unlinked, removed, other-property; 401 without session; 403 without `attachment.view`; 404 when the object is gone; 500 `INTERNAL_ERROR` (no storage detail) when storage throws
- [x] 3.2 Write failing header tests: `Content-Type` from stored mime, `Content-Length`, `Content-Disposition` inline / `?download=1` attachment, `X-Content-Type-Options: nosniff`, CSP, `Cache-Control: private, max-age=300`, `ETag`; `If-None-Match` match → 304 empty body
- [x] 3.3 Add `openFile(propertyId, id, { ifNoneMatch, download })` in `lib/attachments/attachment-service.ts` (property-scoped, linked + non-removed lookup)
- [x] 3.4 Create `app/api/v1/attachments/[id]/file/route.ts` (`withAuth`, permission `attachment.view`, `await connection()`, `isUuid` guard, streamed `Response`) until 3.1–3.2 pass
- [x] 3.5 Create `app/api/v1/attachments/[id]/file/schema.ts` registering the path (binary `image/*` + `application/pdf` 200, 304, 401/403/404/500, `download` query param)

## 4. Metadata endpoint change — attachments spec "Attachment view metadata", REMOVED "Signed viewing"

- [x] 4.1 Update failing tests: `GET /api/v1/attachments/:id` returns `{ url: "/api/v1/attachments/<id>/file", mime, fileName }`, no `expiresAt`, `Cache-Control: no-store`; removed → 404; payout receipt test (owner-statement / payouts) opens through `/file`
- [x] 4.2 Replace `viewUrl()` with `fileMeta()`; update `app/api/v1/attachments/[id]/route.ts`
- [x] 4.3 Update `app/api/v1/attachments/[id]/schema.ts` (`url: z.string()` same-origin path, drop `expiresAt`, new summary/description)
- [x] 4.4 Remove `presignGet` from `Storage`, `s3Storage()` and the fake; delete now-unused code; `pnpm tsc --noEmit` clean

## 5. Swagger

- [x] 5.1 Import the new `attachments/[id]/file/schema.ts` in `app/api/v1/openapi.ts`
- [x] 5.2 Extend `tests/integration/api/openapi.test.ts` to assert `/attachments/{id}/file` is documented and `/attachments/{id}` has no `expiresAt`; verify `/api/v1/openapi.json` in the running dev server

## 6. Client data helpers

- [x] 6.1 Write failing unit test in `lib/api/query.test.ts` for `attachmentFileUrl(id, { download? })`
- [x] 6.2 Add `attachmentFileUrl`; remove `SignedUrl`, `isFreshSignedUrl`, `signedAttachmentQuery`, `qk.attachments.signed` and their tests
- [x] 6.3 Export `refreshSession()` from `lib/api/client.ts` wrapping the coalesced `refreshOnce()`; unit-test that parallel calls trigger one `/auth/refresh`

## 7. Attachment viewer component (TDD) — attachment-viewer spec

- [x] 7.1 Add i18n keys (en + bn) for lightbox labels (Previous, Next, Close, Zoom in, Zoom out, Download), "Couldn't load this file." / "ফাইলটি লোড করা যায়নি।" and open-file aria labels
- [x] 7.2 Write failing component tests `components/attachments/attachment-gallery.test.tsx`: clicking image 2 of 3 opens lightbox at "2 / 3" and calls no `window.open`; image `src` is `/api/v1/attachments/<id>/file`; PDFs render as `<a target="_blank" rel="noopener">` to the same URL and are not slides; → / `Esc` navigate and close; focus returns to the thumbnail; Download points at `?download=1`; Bangla labels + "২ / ৩"; reduced motion disables animation
- [x] 7.3 Write failing tests for load failure: first `onError` calls `refreshSession()` once and retries with a cache-buster; second failure shows "Couldn't load this file."
- [x] 7.4 Build `components/attachments/AttachmentGallery.tsx` (`variant: "thumbnails" | "links"`) with YARL loaded via `next/dynamic` (`ssr: false`), plugins Zoom/Counter/Download/Captions, `portal.root` inside the caller's container
- [x] 7.5 Write a failing test that the lightbox opened from inside an open shadcn `Sheet` is clickable (Next works) and `Esc` closes only the lightbox, leaving the Sheet open; fix with portal root + Esc guard until green
- [x] 7.6 Theme YARL in `app/globals.css` (`.yarl__root` variables → paper/ink tokens, zero radius, system font, no yellow) following the design-system skill

## 8. Wire into screens

- [x] 8.1 Update `components/entries/drawers.test.tsx` expectations (no signed-URL fetch, no `window.open`, lightbox opens over the drawer — entries-ui "View a receipt without leaving the drawer")
- [x] 8.2 Replace thumbnail list + `openFile()` in `components/entries/DetailDrawer.tsx` with `<AttachmentGallery variant="thumbnails">`, keeping the remove ✕ for `canFix`
- [x] 8.3 Add/extend an owners test for the statement row detail opening a receipt image in the lightbox
- [x] 8.4 Replace `openFile()` + file-name buttons in `components/owners/StatementTable.tsx` (`RowDetail`) with `<AttachmentGallery variant="links">`
- [x] 8.5 `grep` the codebase for `presignGet`, `signedAttachmentQuery`, `window.open(` on attachments, `expiresAt` on attachments — none left

## 9. End-to-end and verification

- [x] 9.1 Extend `e2e/income-expenses.spec.ts`: open an entry with an image receipt, click the thumbnail, assert the lightbox dialog is visible, no new page/popup opened, the `img` `src` starts with the app's `baseURL`, close with `Esc`, drawer still open
- [x] 9.2 Manually verify in the dev server ($CONDUCTOR_PORT): network tab shows only same-origin file requests; PDF opens inline in a new tab from the app domain; Bangla UI labels; screenshot to `.context/`
- [x] 9.3 Run `pnpm lint`, `pnpm tsc --noEmit`, `pnpm test` (unit + integration) and the e2e suite — all green
  - Result: lint, tsc, vitest (96 files / 874 tests) green; e2e auth + income-expenses 20/21 — "voiding … (VOD-01)" focus assertion fails identically on clean HEAD (pre-existing, out of scope)
- [x] 9.4 Note the PRD ATT-02 / §13 wording deviation (signed URL → authenticated proxy) for the archive step
