## Context

See proposal.md — Why. Current state:

- `lib/storage/index.ts` wraps a private S3-compatible bucket. Browsers PUT uploads directly (presigned) and, today, GET files directly via `presignGet` (5-minute URL from `S3_PUBLIC_ENDPOINT`). The server-side client (`S3_ENDPOINT`) already does `HeadObject` and ranged `GetObject` for magic-byte sniffing.
- `GET /api/v1/attachments/:id` → `viewUrl()` returns `{ url, mime, fileName, expiresAt }` with the presigned URL.
- Client: `lib/api/query.ts` caches signed URLs per attachment (`signedAttachmentQuery`, stale 30 s before expiry). `components/entries/DetailDrawer.tsx` renders `<img src={signedUrl}>` thumbnails and `openFile()` does `window.open(url)` with a Safari "open blank tab first, then set location" workaround. `components/owners/StatementTable.tsx` (`RowDetail`) duplicates the same `openFile()` for file-name links.
- Auth is cookie-based (`bh_access` / refresh cookie). `withAuth` in `lib/auth/guard.ts` reads cookies, checks the permission and returns `401 UNAUTHENTICATED` / `403`. `apiFetch` transparently refreshes on 401 via a private `refreshOnce()`; a plain `<img>` request cannot do that.
- `proxy.ts` (Next 16 "middleware") excludes `/api` routes, so API handlers own their auth.
- Both viewers live inside a Radix-based shadcn `Sheet` (modal dialog: focus trap + `pointer-events: none` on outside content).

## Goals / Non-Goals

**Goals:**
- Browser never sees a storage URL; every file byte request is permission-checked on the app origin.
- One reusable viewer component for every screen that lists attachments.
- Remove the expiry/refresh/Safari workaround code paths on the client.

**Non-Goals:**
- Changing the upload path, storage layout, DB schema or attachment validation rules.
- Range requests, thumbnail generation, CDN caching.

## Decisions

### D1 — Stream through a Route Handler, not a redirect or a Next rewrite
`app/api/v1/attachments/[id]/file/route.ts` (`withAuth`, permission `attachment.view`, `await connection()`) looks up the linked attachment scoped by `propertyId`, calls `storage().get(storageKey)` on the **server** S3 client, and returns `new Response(body.transformToWebStream(), { headers })`.

- *Alternative: 302 to a presigned URL* — still exposes the S3 host/key in the address bar and devtools; rejected (the user's explicit requirement).
- *Alternative: `next.config` `rewrites` to the bucket* — rewrites can't sign requests to a private bucket and can't run the permission check; rejected.
- *Alternative: buffer the object then respond* — simpler, but holds up to 5 MB per request in memory; streaming is the same amount of code with the SDK's `transformToWebStream()`.

Headers are set from the DB row, not from S3 (`Content-Type` = stored validated mime; `Content-Length` from S3 `ContentLength`; `ETag` from S3 `ETag`). Security headers: `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'` (allows the browser's own PDF/image viewer, blocks scripts), `Cache-Control: private, max-age=300`. `?download=1` switches `inline` → `attachment`. The existing `contentDisposition()` helper moves from `lib/storage` to a small shared helper so both the stream and its test use it.

`If-None-Match`: compare against the S3 ETag. To answer 304 without downloading the body, the handler does `storage().head(key)` (already exists, extend to return `etag`) first when `If-None-Match` is present; otherwise a single `GetObject` returns body + ETag. Objects are immutable (ATT-02: never replaced in place), so ETag is stable.

### D2 — Storage interface: add `get`, drop `presignGet`
```ts
get(key: string): Promise<{ body: ReadableStream<Uint8Array>; size: number; etag: string | null } | null>; // null = NoSuchKey
head(key: string): Promise<{ size: number; etag: string | null } | null>;
```
`presignGet` and the browser-endpoint GET usage are deleted; `presignPut` still uses `S3_PUBLIC_ENDPOINT`. `tests/helpers/fake-storage.ts` implements `get` from the in-memory map (etag = sha1 of bytes) and can be told to throw, to cover the 500 path.

### D3 — `GET /api/v1/attachments/:id` keeps its path, loses the signed URL
`viewUrl()` becomes `fileMeta()` returning `{ url: \`/api/v1/attachments/${id}/file\`, mime, fileName }`. `url` is a **relative** same-origin path (OpenAPI `z.string()` instead of `z.url()`), so it resolves to whatever domain the user is on (`localhost:3000`, staging, prod) with no `APP_URL` config. `expiresAt` is removed — a shape change, but the only consumers are this app's two screens, which this change rewrites. Not moved to `/api/v2` because there is no external client; flagged in the proposal as **BREAKING (internal)**.

The client no longer needs this endpoint to render files: DTOs on entries and statement rows already carry `{ id, fileName, mime }`, so `attachmentFileUrl(id)` in `lib/api/query.ts` builds the URL synchronously. That removes the per-thumbnail signed-URL query and the `qk.attachments.signed` key, and lets PDFs open via a plain `<a href target="_blank" rel="noopener">` (no Safari `window.open`-after-await problem because there is no await).

### D4 — Yet Another React Lightbox, wrapped once
New `components/attachments/AttachmentLightbox.tsx` (client component):

```tsx
<AttachmentGallery locale items={attachments} variant="thumbnails" | "links" />
```
- Renders the tiles/links itself (so DetailDrawer and RowDetail stop duplicating `openFile`), splits `items` into images (lightbox slides) and PDFs (plain links).
- `yet-another-react-lightbox` with plugins `Zoom` and `Download`. The counter ("2 / 3") and file-name caption are our own `render.controls` component instead of the `Counter`/`Captions` plugins, because the Counter plugin can't print Bangla digits. Arrows are hidden for a single photo. Slides: `{ src: attachmentFileUrl(id), alt: fileName, download: { url: attachmentFileUrl(id, { download: true }), filename } }`.
- The lightbox module (`components/attachments/Viewer.tsx`) is loaded with `React.lazy` + `Suspense` on first open, so its JS only ships when a user opens a photo (works the same in jsdom tests, unlike `next/dynamic`).
- `on.view` keeps the gallery's `index` in step with the shown slide: YARL resets to the `index` prop whenever `slides` change (e.g. a retry changes every URL), which would otherwise jump back to the first-opened photo.
- `labels` prop from `lib/i18n` (en/bn); counter rendered with the app's digit formatter for বাংলা.
- `animation` set to `{ fade: 0, swipe: 0 }` when `prefers-reduced-motion` matches.
- **Radix modal conflict:** YARL portals to `document.body` by default; the Sheet's modal focus trap and `pointer-events: none` would make the lightbox unclickable and steal focus. Fix: pass `portal={{ root: containerRef.current }}` pointing at an element *inside* `SheetContent`, so the lightbox is part of the dialog's DOM subtree (focus trap includes it; pointer events allowed). The lightbox's own `Esc` handler must `stopPropagation` so `Esc` closes only the lightbox, not the drawer (YARL `on.close` + a keydown capture guard; covered by a test).
- Focus return: YARL restores focus to the previously focused element on close; verified by test.

*Alternatives:* a hand-rolled `Dialog` + `<img>` (no zoom/swipe/pinch — reinventing YARL, which the user named); `react-photo-view` / PhotoSwipe (not requested, PhotoSwipe needs image dimensions up front).

### D5 — Theming
Import `yet-another-react-lightbox/styles.css` (+ plugin CSS for counter/captions) once in the component, then override YARL CSS variables in `app/globals.css` under `.yarl__root` with design-system tokens: backdrop `--yarl__color_backdrop: color-mix(in oklab, var(--foreground) 92%, transparent)`, buttons/text on paper token, `border-radius: 0` on buttons, caption font = system font token. No new colours; no yellow (the yellow signal fill is reserved). Per the barihisab-design-system skill, read it before styling.

### D6 — Session expiry for `<img>` requests
Images are plain GETs that carry cookies but can't run `apiFetch`'s refresh. On thumbnail/slide `onError`, the gallery calls an exported `refreshSession()` (thin wrapper around the existing coalesced `refreshOnce()` in `lib/api/client.ts`), then bumps a revision so every image reloads with a `?r=<n>` cache-buster. Each failure gets one retry: an image failing again on its retry URL shows the "Couldn't load this file." placeholder (YARL `render.iconError` / thumbnail fallback, also in the thumbnail's accessible name); an image that loaded and fails later — the next token expiry in a long-open drawer — is retried again. Slide load/error events are caught on a wrapper element, since React bubbles them through the portal. Coalescing means N broken images trigger one refresh.

### D7 — PRD deviation (ATT-02, §13 Files)
PRD says "view via 5-minute signed URL". This design serves files through an authenticated proxy instead. Intent preserved (private bucket, access-controlled viewing); behaviour is stricter (every request checked, no bearer link). PRD §6.3 "PDFs open in a new tab" is kept. Update PRD wording during archive.

## Risks / Trade-offs

- [App server now carries file bytes (≤ 5 MB each, 5 per entry)] → streaming keeps memory flat; `Cache-Control: private, max-age=300` + ETag/304 avoids re-downloads; self-hosted Node runtime has no body-size limit on responses. If traffic grows, revisit with a CDN-signed-cookie setup (out of scope).
- [Serving user-uploaded files from the app origin enables stored-XSS if a file is HTML/SVG] → only JPEG/PNG/WebP/PDF are linkable (magic-byte check at link time), `Content-Type` comes from the validated mime, `nosniff` + script-blocking CSP on every file response. SVG is not an allowed type.
- [Lightbox inside a Radix modal: focus/pointer conflicts] → portal into the Sheet (D4) with explicit tests for clicking Next and `Esc` behaviour.
- [`<img>` 401 after access-token expiry] → D6 refresh-once-and-retry.
- [YARL bundle size ~25 KB gz with plugins] → dynamic import on first open.
- [Removing `expiresAt` breaks any external script using `/attachments/:id`] → none known; documented in Swagger and proposal.

## Migration Plan

1. Ship server endpoint + storage `get` (additive) behind tests.
2. Switch `GET /attachments/:id` response and client in the same deploy (single app, no external clients).
3. Remove `presignGet`, signed-URL query helpers and `window.open` code.
4. Bucket CORS may drop `GET` from allowed methods afterwards (keep `PUT`). Optional, ops-only.

Rollback: revert the commit; no data or schema changes.

## Open Questions

- None blocking. (Whether to later render PDFs inside the lightbox via a custom slide can be decided separately; it doesn't change this API.)
