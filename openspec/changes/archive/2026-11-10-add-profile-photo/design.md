## Context

See proposal.md › Why. Relevant current state:

- `User` (better-auth model + profile columns) has an unused `image String?` owned by better-auth. No photo storage exists.
- Bills/receipts already have a full private-file pipeline: `POST /api/v1/attachments/presign` → browser PUT to the private S3 bucket → `prepareAttachments` (HEAD size check + magic-byte sniff, `lib/files/magic.ts`) → `linkAttachments` inside the write transaction → `GET /api/v1/attachments/:id/file` same-origin proxy (`attachment.view`, which both SUPER_ADMIN and OWNER hold). Rows are never deleted (`att_no_delete` trigger); removal is `removedAt/removedById`. `sweepUnlinkedUploads` soft-removes and deletes the object of any upload never linked within 24 h.
- The bill presign route is gated by `transaction.create | payout.create | advance.create`, so Owners cannot use it.
- `PATCH /api/v1/me` → `updateUserProfile` (one `$transaction`, `user.updated` audit). `POST /api/v1/users` → `createInvitedUser` (one transaction: user + role + audit + invite outbox). `PATCH /api/v1/users/:id` → `updateUserAsAdmin`.
- Avatars render via shadcn `Avatar`/`AvatarFallback` (initials) in `ShellNav` (viewer from `requireViewer()` in `app/[lang]/(app)/layout.tsx`) and `UsersManager`; `AvatarImage` exists but is unused.
- Browser bill compression lives in `components/entries/upload.ts` (`createImageBitmap` → canvas → JPEG 0.8).

## Goals / Non-Goals

**Goals:**
- Reuse the attachment storage, verification, proxy and sweep machinery instead of building a second file pipeline.
- One write path per caller (`PATCH /me`, `POST /users`, `PATCH /users/:id`) so the photo change is atomic with the profile change and its audit row.
- Zero new read endpoint; the photo URL is just an attachment file URL.

**Non-Goals:**
- Server-side image processing (sharp etc.) — no new native dependency.
- Using better-auth's `user.image` column.
- Photos for Owner records that are not users.

## Decisions

### D1. Store photos as `attachments` rows with `entity_type = 'user_avatar'`
The photo is an `Attachment` (`entityType: "user_avatar"`, `entityId: <user id>`, `propertyId: currentPropertyId()`, storage key `p/<propertyId>/avatar/<uuid>`). This inherits private storage, the no-delete trigger, soft removal, the same-origin proxy, ETag/304 and the unlinked-upload sweep for free.
*Alternative:* a separate `user_avatars` table + bucket prefix + proxy route — duplicates ~200 lines of security-sensitive code for no behavioural gain. *Alternative:* store a public URL in `user.image` — violates "private bucket, never expose storage host" (ATT-02).

### D2. `users.avatar_attachment_id` pointer column
Nullable, `@unique`, FK → `attachments.id` `ON DELETE RESTRICT`. `toPublicUser` derives `avatarUrl = attachmentFileUrl(avatarAttachmentId)` with no extra query, so list endpoints stay one query.
*Alternative:* look up the latest linked `user_avatar` attachment per user — an extra join on every user read (session payload, list, shell) and ambiguous if two were ever linked.

### D3. Dedicated presign endpoint `POST /api/v1/avatars/presign`
Permission: any of `profile.update.self`, `user.create`, `user.update` (Owners need it; bill presign permissions don't fit). Images only (`image/jpeg|png|webp`), max 2 MB, `strict: true` (CSRF), `LIMITS.presignPerUser`. Implemented by a `presignAvatarUpload` sibling of `presignUpload` that sets `entityType: "user_avatar"` on the unlinked row so a bill upload can never be used as a photo and vice versa.
*Alternative:* add `purpose` to the existing presign body — mixes two permission models in one route and widens the bill route to Owners.

### D4. Verification and linking: `prepareAvatar` + `setAvatar(tx, …)`
- `prepareAvatar(propertyId, avatarId, actorId)` — outside the transaction (it does network I/O to storage): row must be `entityType = 'user_avatar'`, `entityId IS NULL`, `removedAt IS NULL`, `uploadedById = actorId`, same property; HEAD size ≤ 2 MB and equal to declared; magic bytes match one of the three image types. Failure → `fieldFail("avatarId", …)` → 422.
- `setAvatar(tx, propertyId, userId, avatarId | null, actor)` — inside the caller's transaction: conditional `updateMany` claim (`entityId: null, removedAt: null` → link to user; `count !== 1` → `Abort` 422 "Upload the photo again."), soft-remove the previous photo row (`removedAt`, `removedById`), update `users.avatar_attachment_id`, write `user.avatar.updated` (before/after ids) or `user.avatar.removed`. No-op when the requested id equals the current one.
Mirrors `prepareAttachments` / `linkAttachments`, so the race with the sweep is already handled by the conditional claim.

### D5. `avatarId` rides on existing write bodies
`PatchMeBodySchema`, `CreateUserBodySchema`, `PatchUserBodySchema` gain `avatarId: z.uuid().nullable().optional()`. The service functions (`updateUserProfile`, `createInvitedUser`, `updateUserAsAdmin`) call `prepareAvatar` before their transaction and `setAvatar` inside it. `avatarId` is excluded from the generic `toData`/`diff` path so it never lands in the `user.updated` before/after blob (its own audit row covers it).
`profile.update.self` already covers "photo" per the Auth PRD permission table, so no new permission is introduced and the identity guard (`profile.identity.self`) is not triggered by `avatarId`.

### D6. Browser preparation: square 512 px JPEG
New `components/users/avatar-upload.ts`: accept JPG/PNG/WebP, `createImageBitmap` → center-crop to the shorter side → draw onto a 512×512 canvas (white background) → `toBlob("image/jpeg", 0.85)` → reject if > 2 MB → presign → PUT. Shares the canvas helper with `components/entries/upload.ts` by extracting a small `lib/files/image-canvas.ts` (crop + scale + encode) used by both; bill behaviour stays identical (no crop, max side 2000, quality 0.8).
512 px covers the largest avatar (≈ 96 px on `/me` at 3× DPR ≈ 288 px) with headroom, and keeps photos ~30–80 KB.

### D7. UI components
- `UserAvatar` (`components/users/UserAvatar.tsx`): wraps shadcn `Avatar` + `AvatarImage src={avatarUrl}` + `AvatarFallback` initials; Radix only shows the image after it loads, giving the initials fallback on error for free. Zero radius per design system; `aria-hidden` when next to a visible name.
- `AvatarPicker` (`components/users/AvatarPicker.tsx`): hidden `<input type="file" accept="image/jpeg,image/png,image/webp">` behind a labelled Button, local object-URL preview, "Remove photo" behind `ConfirmDialog` (destructive-action rule), error text wired with `aria-describedby`.
- `/me` (`MeScreen`): Photo block saves immediately via `PATCH /me { avatarId }` then `router.refresh()` so the server-rendered shell picks up the new viewer photo.
- Drawer (`UserForm`): photo picked → held as a `File`; on Save, upload first, then submit with `avatarId`; edit mode sends `avatarId: null` only when the user confirmed removal.
- Shell: `Viewer` gains `avatarUrl`; layout passes it to `ShellNav`.
Icons from `@heroicons/react` (`CameraIcon`, `TrashIcon`). Strings added to `lib/i18n/en.ts` and `bn.ts`.

### D8. PRD deviation
Auth PRD §4 A6 lists the New user drawer fields without a photo; this change adds an optional Photo field on explicit user request (see proposal). No other PRD rule is changed.

## Risks / Trade-offs

- [Photo served with `Cache-Control: private, max-age=300`] → a replaced photo could show for up to 5 min in another tab. Acceptable: the URL changes with the new attachment id, so every page that re-renders gets the new photo at once; only the old URL lingers, and it 404s after cache expiry.
- [Avatar files live under a property-scoped path while users are global] → v1 has exactly one property (RBAC-06); if a second property arrives, avatars stay readable only through the property that stored them. Noted for the multi-property migration.
- [`attachment.view` gates avatar reads] → a future role without `attachment.view` would see initials only. Acceptable; revisit when ACCOUNTANT/VIEWER roles are enabled.
- [Admin uploads a photo then abandons the drawer] → unlinked row is swept after 24 h by the existing worker; no orphaned objects.
- [Canvas APIs missing (old browsers / jsdom)] → upload helper reports "failed" instead of uploading the raw file, because the 2 MB cap and EXIF stripping depend on re-encoding; tests stub `createImageBitmap`/canvas.

## Migration Plan

1. Prisma migration adds `users.avatar_attachment_id uuid NULL UNIQUE REFERENCES attachments(id) ON DELETE RESTRICT`. Additive, no backfill; existing users get `avatarUrl: null`.
2. Deploy API + UI together (the UI only sends `avatarId` to endpoints that accept it).
3. Rollback: revert the code; the nullable column can stay (unused) or be dropped by a follow-up migration once no rows reference it. Linked avatar attachment rows remain as soft history.
