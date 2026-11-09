## 1. Foundation: AlertDialog + ConfirmDialog

- [x] 1.1 Add shadcn `alert-dialog` (`pnpm dlx shadcn add alert-dialog`); restyle to design tokens (0 radius, 2px ink border, shadow-lg, title 20px/800, right-aligned actions Cancel → primary); ensure no lucide import (heroicons only)
- [x] 1.2 Write failing tests `components/app/confirm-dialog.test.tsx`: renders as `alertdialog` with title/description; Cancel focused on open; Cancel/Escape call `onOpenChange(false)` and never `onConfirm`; double-click confirm calls `onConfirm` once; `busy` disables both buttons and blocks Escape; `confirmDisabled` disables confirm; `tone="destructive"` applies destructive variant; focus returns to trigger on close
- [x] 1.3 Implement `components/app/confirm-dialog.tsx` (API per design.md §2) until 1.2 passes
- [x] 1.4 Add i18n keys to `lib/i18n/en.ts` and `lib/i18n/bn.ts`: `confirm.logout.{title,body}`, `invite.logoutConfirm.{title,body}`, `me.session.confirm.{title,body}`, `users.dialog.{revokeInvite,resendInvite,roleChange}{,Body}` (+ `demoteBody`/`promoteBody`), `users.action.changeRole`; reuse existing action-verb keys (`nav.logout`, `me.session.logout`, `me.logoutAll`, `users.action.*`) as confirm labels; run `lib/i18n/i18n.test.ts` (key parity)

## 2. Logout confirmation (shell + invite)

- [x] 2.1 Write failing tests in `components/app/shell.test.tsx`: sidebar Log out opens modal and sends no request; Cancel keeps session; confirm sends one `POST /auth/logout` and navigates to `/{lang}/login`; 500 → stays + error toast; 401 → treated as logged out; bottom-nav Log out opens the same modal; bn strings render
- [x] 2.2 Implement `LogoutButton`/shared logout confirm in `components/app/` and wire sidebar + bottom nav in `ShellNav.tsx` to a single `ConfirmDialog` (keep existing 401 rule and `leaving` busy state)
- [x] 2.3 Write failing test in `components/auth/auth-forms.test.tsx`: InviteState "Log out to continue" opens modal; request sent only after confirm
- [x] 2.4 Wire `InviteState.tsx` to the confirm flow

## 3. `/me` sessions

- [x] 3.1 Write failing tests in `components/me/me.test.tsx`: per-session Log out opens modal naming `{device} · {browser}`; `DELETE /me/sessions/{id}` only after confirm; cancel sends nothing; failure shows toast and keeps the row; Log out all devices still confirms, now with action-verb destructive button
- [x] 3.2 Implement in `MeScreen.tsx`: replace hand-rolled `Dialog` with `ConfirmDialog` for logout-all; add confirm state for single-session revoke

## 4. `/admin/users`

- [x] 4.1 Write failing tests in `components/users/users.test.tsx`: Revoke invite and Resend invite open modals with name + consequence and send only after confirm; Deactivate/Reactivate still require a trimmed reason (confirm disabled when blank); Deactivate/Log out everywhere use destructive style; Reactivate uses default tone; last-admin Deactivate remains disabled
- [x] 4.2 Refactor `UsersManager.tsx`: widen `Confirm` kind union, remove `simpleAction`, per-kind lookup table (title/body/label/tone/needsReason), single `ConfirmDialog`
- [x] 4.3 Write failing tests for `UserForm.tsx`: any role change (demote or promote — server revokes the target's sessions either way) on Save opens confirm above the Sheet and sends no request until confirm; cancel keeps drawer open with no request; profile-only edits and new-user creation save without a modal
- [x] 4.4 Implement role-change confirm in `UserForm.tsx` (skip when `roleLocked` or creating)

## 5. E2E, visual, and verification

- [x] 5.1 Update `e2e/auth.spec.ts` logout steps to confirm the dialog; add a cancel-path E2E (click Log out → Cancel → still on app) and a confirm-path E2E for revoke invite
- [x] 5.2 Add `e2e/visual.spec.ts` screenshots for the logout and log-out-all dialogs (desktop + 360px, bn + en; asserts the dialog fits the viewport). Revoke-invite dialog is exercised by the auth E2E flow instead — visual spec has no guaranteed Invited user (the visual spec writes screenshots, it has no pixel baselines)
- [x] 5.3 Grep `components/` and `app/[lang]/` for any remaining logout/revoke/delete/deactivate `onClick`/`onSelect` that calls `apiFetch` without a `ConfirmDialog` — must be zero
- [x] 5.4 Swagger: no endpoints added or changed. Confirm `/api/v1/openapi.json` still returns 200 and the path count is unchanged
- [x] 5.5 Run `pnpm tsc --noEmit`, `pnpm lint`, unit/UI tests, integration tests, and Playwright E2E — all green
- [x] 5.6 Visual check of the dialogs — done from the E2E screenshots in `.context/screens/*confirm*` (test DB, prod build). The dev-server pass was skipped: no dev-DB admin password available, and dev data was not reset
