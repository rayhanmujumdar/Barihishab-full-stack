## Why

Every user is shown today as a square of initials — in the shell nav, the Users table and on `/me`. The PRD already promises a profile photo (Main PRD USR-05 "Own profile page (photo, …)"; Auth PRD permission `profile.update.self` "Edit own … photo"; Auth PRD §4 A6 "Person (avatar, name, username)"), but `User` has no photo and nothing can upload one. Family members recognise faces faster than initials, and the Super Admin wants to set the photo while adding a new person, not ask them to do it later.

## What Changes

- New **profile photo** for every user: one JPG/PNG/WebP image, cropped square and compressed in the browser, stored in the existing private bucket as an `attachments` row (`entity_type = 'user_avatar'`), never public.
- New endpoint `POST /api/v1/avatars/presign` — presigned upload for a photo (images only, ≤ 2 MB), allowed with `profile.update.self`, `user.create` or `user.update`.
- `PATCH /api/v1/me` accepts `avatarId` (uuid to set/replace, `null` to remove) under the existing `profile.update.self` permission — any user can change their own photo.
- `POST /api/v1/users` (new user) and `PATCH /api/v1/users/:id` (edit user) accept `avatarId`, so the Super Admin can add a photo when creating a user and change/remove it later.
- `PublicUser` gains `avatarUrl: string | null` (same-origin `/api/v1/attachments/:id/file` URL); the existing file proxy serves it with no new read endpoint.
- Replacing or removing a photo soft-removes the old attachment row (files are never hard-deleted) and writes an audit row; set/replace/remove happen in one transaction with the user update.
- UI: photo picker with preview on `/me` (Profile section) and in the New user / Edit user drawer; the photo replaces initials in the shell nav, the Users table and `/me`, falling back to initials when missing or failing to load. Removing a photo asks for confirmation first.

## PRD coverage

- Main PRD (`docs/barihishab_management_README.md`) **USR-05** — own profile page with photo.
- Auth PRD (`docs/barihishab_authentication_autorization.md`) §3 permission `profile.update.self` (photo), **USR-01** (create/edit user fields, extended with photo), **USR-06** (owner edits own profile), §4 **A6** (avatar column), §4 **A7** (profile screen).
- Income & Expenses PRD §8 / IE-20 file rules (private bucket, magic-byte check) are reused for photos.
- **PRD extension (flagged):** Auth PRD §4 A6 lists the New user drawer fields without a photo. The user asked for photo upload on new-user creation, so this change adds an optional Photo field to that drawer. No PRD rule forbids it.

## Out of scope

- Uploading a photo on the Accept invite screen (A4) — the invited person can add it on `/me` after first login.
- Showing photos on Owner cards (`/owners`, Distribution board) — Owners PRD specifies initials avatars; can follow once owners are linked to users in the UI.
- Server-side image resizing / thumbnails (the browser produces a 512 px square; the server only validates).
- Public or unauthenticated avatar URLs, Gravatar, or better-auth's `user.image` column (left untouched).
- Email templates showing the photo.

## Capabilities

### New Capabilities
- `profile-photo`: upload, set, replace and remove a user's profile photo (self and Super Admin), storage and validation rules, `avatarUrl` in the user DTO, and where the photo is shown with initials fallback.

### Modified Capabilities
- `auth-ui`: User management screen (A6) drawer gains an optional Photo field and the table shows the photo; Profile and security screen (A7) gains a Photo section with change/remove.

## Impact

- **Database:** new nullable unique column `users.avatar_attachment_id` (FK → `attachments.id`, `ON DELETE RESTRICT`); Prisma migration. No change to `attachments` columns (`entity_type` is free text).
- **API:** new `app/api/v1/avatars/presign/{route,schema}.ts`; `PatchMeBodySchema`, `CreateUserBodySchema`, `PatchUserBodySchema` gain `avatarId`; `PublicUserSchema` gains `avatarUrl`; all registered in Swagger (`app/api/v1/openapi.ts`).
- **Services:** `lib/attachments/attachment-service.ts` (avatar presign + link/verify helpers), `lib/users/user-service.ts`, `lib/users/admin-service.ts`, `lib/users/dto.ts`, `lib/audit.ts` action names, `lib/files/magic.ts` (images-only subset).
- **UI:** `components/me/MeScreen.tsx`, `components/users/UserForm.tsx`, `components/users/UsersManager.tsx`, `components/app/ShellNav.tsx`, new shared `components/users/AvatarPicker.tsx` + `UserAvatar.tsx`, `lib/i18n/{en,bn}.ts`.
- **Housekeeping:** existing `sweepUnlinkedUploads` already cleans abandoned photo uploads (unlinked rows, any entity type).
- **Rate limit:** reuses `LIMITS.presignPerUser`.
