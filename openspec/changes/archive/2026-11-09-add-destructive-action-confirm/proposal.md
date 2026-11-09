## Why

Several buttons end sessions or kill links on a single click with no way back: the sidebar/bottom-nav **Log out**, the invite screen's **Log out to continue**, per-device **Log out** on `/me`, and **Revoke invite** / **Resend invite** in user management. A misclick on a phone (bottom nav sits under the thumb) logs the user out or kills an invite that was already sent to a co-owner. Only some actions (deactivate, reactivate, admin force-logout, log out all devices) have a confirm dialog today, each hand-rolled with its own copy and button styling. We want one rule, applied everywhere: **every logout, delete and other destructive action asks first.**

## What Changes

- Add one shared `ConfirmDialog` component (shadcn `AlertDialog`, themed to the design system) used for all destructive confirmations: title, consequence text, **Cancel** (focused by default) + destructive **Confirm** button, busy state, optional required-reason field.
- **New confirmations** (none today):
  - App shell **Log out** — sidebar icon button and mobile bottom-nav button (AUTH-05).
  - Invite screen **Log out to continue** (A4).
  - `/me` per-session **Log out** (revoke one device) (AUTH-07).
  - `/admin/users` **Revoke invite** (INV-05) and **Resend invite** (INV-04 — resending kills the previously sent link).
  - `/admin/users` user drawer: saving a **role demotion** (Super Admin → Owner), which revokes that user's sessions (Auth PRD §3.4, USR-02).
- **Migrate existing confirmations** to the shared component with no behavior change: Deactivate / Reactivate with reason (USR-03), admin **Log out everywhere** (USR-05), `/me` **Log out all devices** (AUTH-05).
- Bilingual (`bn` default, `en`) title / body / confirm-label strings for every dialog.
- Project rule: any future logout, delete, void, reverse, revoke, deactivate or similar irreversible button MUST use `ConfirmDialog`. This matches the design-system rule that destructive or financial-final actions always go through a dialog.

PRD coverage: Auth PRD §3.4 (logout & session life), §4 A4/A5/A6/A7 screens, AUTH-05, AUTH-07, INV-04, INV-05, USR-02, USR-03, USR-05; §8 Accessibility. Main PRD `docs/barihishab_management_README.md`: no requirement conflict. Future void/reverse/close-and-lock flows there will use the same component.

### Out of scope

- API or server behavior changes. All endpoints, permissions and audit events stay the same. This change is UI only.
- Hard delete of users or financial data. The PRD forbids it ("never deleted, only deactivated"; void/reverse instead), so no delete buttons exist yet.
- "Unsaved changes" guard when closing a form or drawer.
- Undo/toast-based recovery instead of confirmation.
- Non-destructive actions (Edit, Save profile, Change password submit, filters, language toggle).

## Capabilities

### New Capabilities
- `destructive-action-confirm`: Every destructive or session-ending UI action (logout, logout all, revoke session, revoke/resend invite, deactivate/reactivate, force logout, role demotion, and future delete/void/reverse) requires an explicit confirmation in an accessible, bilingual modal before any request is sent.

### Modified Capabilities
<!-- None in openspec/specs/ yet: the auth-ui spec lives in the un-archived add-auth-foundation change. Its A6 confirm requirement (deactivate/reactivate + reason) is kept and generalized by the new capability rather than modified. -->

## Impact

- **New**: `components/ui/alert-dialog.tsx` (shadcn add, themed), `components/app/confirm-dialog.tsx` + tests.
- **Modified UI**: `components/app/ShellNav.tsx`, `components/auth/InviteState.tsx`, `components/me/MeScreen.tsx`, `components/users/UsersManager.tsx`, `components/users/UserForm.tsx`.
- **i18n**: `lib/i18n/en.ts`, `lib/i18n/bn.ts` gain new confirm keys.
- **Tests**: `components/app/shell.test.tsx`, `components/me/me.test.tsx`, `components/users/users.test.tsx`, `components/auth/auth-forms.test.tsx`, `e2e/auth.spec.ts` (logout now needs a confirm click), `e2e/visual.spec.ts` baselines for the new dialogs.
- **Dependencies**: none new. `radix-ui` already ships `AlertDialog`.
- **APIs**: none. No Swagger change.
