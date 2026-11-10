## 1. Schema

- [x] 1.1 Write failing schema test in `tests/integration/db/schema.test.ts` (or new `avatar-schema.test.ts`): `users.avatar_attachment_id` exists, is nullable, unique, FK → `attachments.id` with `ON DELETE RESTRICT`
- [x] 1.2 Add `avatarAttachmentId String? @unique @map("avatar_attachment_id") @db.Uuid` + relation to `Attachment` on `User` in `prisma/schema.prisma`; create migration (`pnpm db:migrate --name user_avatar`), run `pnpm db:generate`, apply to the shared `barihishab_test` DB; 1.1 passes

## 2. Storage & verification service (D1, D3, D4)

- [x] 2.1 Write failing unit tests for an images-only sniff helper in `lib/files/magic.test.ts` (`IMAGE_MIME` = jpeg/png/webp; PDF bytes rejected for avatars)
- [x] 2.2 Add `IMAGE_MIME` / `isImageMime` to `lib/files/magic.ts`
- [x] 2.3 Write failing integration tests (fake storage, `tests/helpers/fake-storage.ts`) for `presignAvatarUpload`: row created unlinked with `entityType = "user_avatar"`, key prefix `p/<pid>/avatar/`, size > 2 MB → `FILE_TOO_LARGE`
- [x] 2.4 Write failing integration tests for `prepareAvatar`: rejects other uploader's id, a bill (`house_transaction`) upload id, already-linked id, removed id, missing object, size mismatch, magic-byte mismatch — each → `fieldFail("avatarId")`
- [x] 2.5 Write failing integration tests for `setAvatar(tx, …)`: first set links row + sets pointer + audit `user.avatar.updated`; replace soft-removes previous (removedAt/removedById) and audits before/after ids; `null` removes + audit `user.avatar.removed`; same id is a no-op; concurrent claim (`count !== 1`) aborts with 422
- [x] 2.6 Implement `presignAvatarUpload`, `prepareAvatar`, `setAvatar` and `AVATAR_MAX_BYTES = 2 * 1024 * 1024` in `lib/attachments/avatar-service.ts` (reusing `storage()`, `matchesMime`, `Abort`, `audit`); add `user.avatar.updated` / `user.avatar.removed` to the audit action union in `lib/audit.ts`; 2.3–2.5 pass
- [x] 2.7 Confirm `sweepUnlinkedUploads` already sweeps unlinked `user_avatar` rows (add one test case)

## 3. User DTO

- [x] 3.1 Write failing unit test: `toPublicUser` returns `avatarUrl: "/api/v1/attachments/<id>/file"` when `avatarAttachmentId` is set and `null` otherwise
- [x] 3.2 Add `avatarUrl` to `PublicUser` in `lib/users/dto.ts` (via `attachmentFileUrl`) and to `PublicUserSchema` in `lib/api/schemas.ts`; add `avatarUrl` to the `Viewer` type in `lib/auth/server.ts`

## 4. API endpoints

- [x] 4.1 Write failing tests `tests/integration/api/avatars.test.ts` for `POST /api/v1/avatars/presign`: Owner `201`; PDF mime `422` with `details.fields.mime`; size 3 000 000 → `413 FILE_TOO_LARGE`; no session `401`; missing CSRF header `403`; rate limit `429` after `presignPerUser` max
- [x] 4.2 Implement `app/api/v1/avatars/presign/{route,schema}.ts` (permission any of `profile.update.self | user.create | user.update`, `strict: true`, `limitBy(LIMITS.presignPerUser)`); 4.1 passes
- [x] 4.3 Write failing tests in `tests/integration/api/me.test.ts`: set / replace / remove own photo via `PATCH /me { avatarId }`; replaced photo's file URL → `404`; Owner without `profile.identity.self` can set photo; `{ avatarId, phone: "12345" }` → `422` and nothing changes; spoofed/foreign `avatarId` → `422 details.fields.avatarId`
- [x] 4.4 Add `avatarId: z.uuid().nullable().optional()` to `PatchMeBodySchema`; extend `ProfilePatch`/`updateUserProfile` in `lib/users/user-service.ts` to run `prepareAvatar` before and `setAvatar` inside its transaction, excluding `avatarId` from `toData`/`diff`; 4.3 passes
- [x] 4.5 Write failing tests in `tests/integration/api/users-create-list.test.ts` / `users-admin-actions.test.ts`: create user with verified `avatarId` → `201` + `avatarUrl`; create with bad `avatarId` → `422`, no user row, no invite in `email_outbox`; `PATCH /users/:id { avatarId: null }` by Super Admin → `200` + `avatarUrl: null`; Owner `PATCH /users/:id` → `403`; list items include `avatarUrl`
- [x] 4.6 Add `avatarId` to `CreateUserBodySchema` and `PatchUserBodySchema`; wire `prepareAvatar`/`setAvatar` into `createInvitedUser` (same transaction as user + invite) and `updateUserAsAdmin` in `lib/users/admin-service.ts`; 4.5 passes
- [x] 4.7 Register the presign path in Swagger (import schema in `app/api/v1/openapi.ts`), update `PatchMeBody`, `CreateUserBody`, `PatchUserBody`, `PublicUser` docs; extend `tests/integration/api/openapi.test.ts` and verify `/api/v1/openapi.json` lists `POST /avatars/presign` and `avatarUrl`

## 5. Browser upload helper (D6)

- [x] 5.1 Write failing unit tests for `lib/files/image-canvas.ts` (crop-to-square + max side + JPEG encode, canvas stubbed) and for `components/users/avatar-upload.ts`: PDF rejected without calling the API; 4000×3000 input → 512×512 JPEG; result > 2 MB rejected; presign → PUT → returns `avatarId`; canvas unavailable → `failed`
- [x] 5.2 Extract the shared canvas helper from `components/entries/upload.ts` into `lib/files/image-canvas.ts` (bill behaviour unchanged — existing upload tests still pass) and implement `uploadAvatar` in `components/users/avatar-upload.ts`; 5.1 passes

## 6. UI components (D7) — follow barihisab-design-system skill

- [x] 6.1 Write failing UI tests for `UserAvatar`: renders `<img>` with `avatarUrl` once loaded; renders initials when `avatarUrl` is null or the image errors; zero radius; `aria-hidden` when decorative
- [x] 6.2 Implement `components/users/UserAvatar.tsx` on shadcn `Avatar`/`AvatarImage`/`AvatarFallback`
- [x] 6.3 Write failing UI tests for `AvatarPicker`: file input accepts only jpeg/png/webp; shows square preview of picked file; wrong type shows "Only JPG, PNG or WebP up to 2 MB." (linked by `aria-describedby`); "Remove photo" opens a confirm dialog and only calls `onRemove` after confirm
- [x] 6.4 Implement `components/users/AvatarPicker.tsx` (shadcn Button + ConfirmDialog, `CameraIcon`/`TrashIcon` from `@heroicons/react`); add en + bn strings in `lib/i18n/en.ts` / `bn.ts`

## 7. Screens

- [x] 7.1 Write failing UI tests in `components/me/me.test.tsx`: Photo block shows current photo/initials; "Change photo" uploads and calls `PATCH /me { avatarId }`, then shows success toast and refreshes; "Remove photo" confirms then sends `{ avatarId: null }`; upload failure shows field error
- [x] 7.2 Add the Photo block to `components/me/MeScreen.tsx` (saves immediately, independent of profile Save; `router.refresh()` after success)
- [x] 7.3 Write failing UI tests in `components/users/users.test.tsx`: New user drawer has optional Photo field; save uploads first then posts with `avatarId`; upload failure keeps drawer open with values and no POST; Edit drawer can replace/remove photo (remove confirmed); table Person column uses `UserAvatar`
- [x] 7.4 Add Photo field to `components/users/UserForm.tsx` and use `UserAvatar` in `components/users/UsersManager.tsx`
- [x] 7.5 Pass `avatarUrl` from `requireViewer()` through `app/[lang]/(app)/layout.tsx` to `ShellNav`, render `UserAvatar` there; update ShellNav tests

## 8. End-to-end & verification

- [x] 8.1 Add e2e cases to `e2e/auth.spec.ts`: Owner changes photo on `/me` and sees it in the shell; Super Admin creates a user with a photo and sees it in the table; remove photo via confirm dialog. Clean up created users/attachments per existing e2e conventions
- [x] 8.2 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:e2e`; all green
- [x] 8.3 Manual check on the running dev server (`$CONDUCTOR_PORT`): upload a large phone JPEG, confirm the stored object is 512×512 JPEG with no EXIF, the `<img>` src is same-origin, and a replaced photo URL returns 404
