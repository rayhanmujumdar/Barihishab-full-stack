## Context

See proposal.md for the motivation. Current state of the UI:

| Site | Action | Confirm today |
|---|---|---|
| `components/app/ShellNav.tsx` (sidebar icon + bottom nav) | `POST /auth/logout` | none |
| `components/auth/InviteState.tsx` | `POST /auth/logout` then reload | none |
| `components/me/MeScreen.tsx` session row | `DELETE /me/sessions/{id}` | none |
| `components/me/MeScreen.tsx` | `POST /auth/logout-all` | hand-rolled `Dialog`, generic "Confirm" button |
| `components/users/UsersManager.tsx` | revoke-invite / resend-invite (`simpleAction`) | none |
| `components/users/UsersManager.tsx` | deactivate / reactivate / revoke-sessions | hand-rolled `Dialog` with reason, non-destructive button style |
| `components/users/UserForm.tsx` | `PUT /users/{id}/roles` on demotion | none |

UI uses shadcn components on `radix-ui` (unified package, already includes `AlertDialog`). Styling follows the barihisab design system: zero radius, ink on paper, dialog title 20px/800, actions right-aligned with secondary (Cancel) before primary. Icons come only from `@heroicons/react`.

## Goals / Non-Goals

**Goals:**
- One component and one pattern for every destructive confirmation, so new screens (void payment, close month, etc.) get it for free.
- Existing confirmations keep their behavior (reason required, last-admin guard) but share the component.

**Non-Goals:**
- A global imperative `confirm()` service or provider. Not needed for 7 call sites, and declarative state is easier to test.
- Typing a phrase to confirm ("type DELETE"). Too heavy for the actions in scope. We can revisit for future hard-final financial actions.

## Decisions

1. **`AlertDialog` over `Dialog`.** Radix `AlertDialog` sets `role="alertdialog"`, blocks outside-click dismissal, and supports `onOpenAutoFocus` so we can put focus on Cancel. Plain `Dialog` closes on an overlay click, which is a misclick path we are trying to remove. Add it with `pnpm dlx shadcn add alert-dialog`, then restyle to match the existing `Dialog` (0 radius, ink 50% backdrop, shadow-lg, flush-left header) and swap any lucide icon for heroicons.

2. **Shared `components/app/confirm-dialog.tsx`, declarative API.**
   ```ts
   type ConfirmDialogProps = {
     open: boolean;
     onOpenChange: (open: boolean) => void;
     title: string;
     description: ReactNode;
     confirmLabel: string;           // action verb, never "OK"
     cancelLabel: string;
     tone?: "destructive" | "default"; // default "destructive"; reactivate uses "default"
     busy?: boolean;                 // disables both buttons and blocks dismiss
     confirmDisabled?: boolean;      // e.g. empty reason
     onConfirm: () => void | Promise<void>;
     children?: ReactNode;           // optional body slot (reason field)
   };
   ```
   The component owns: Cancel autofocus, focus return to the opener (Radix only restores focus to an `AlertDialogTrigger`, and our dialogs open from state), a guard that ignores `onConfirm` while `busy` or when a confirm is already in flight (ref-based, so a double click sends once even before React re-renders), and blocking Escape and close while `busy`. Callers own: the request, error display, and closing on success.
   *Alternative:* a `useConfirm()` hook that returns a promise. It reads nicely at the call site, but it hides the open state from tests and makes the reason-field slot awkward. Rejected.

3. **Logout confirmation lives in a small `LogoutButton` wrapper**, reused by the sidebar, bottom nav and invite screen. It holds the open state and the logout request with the existing 401-is-success rule from ShellNav. This avoids copying the logout logic into three places. ShellNav keeps a single dialog instance shared by both of its triggers.

4. **`UsersManager` widens its `Confirm` union** to `"deactivate" | "reactivate" | "logout" | "revokeInvite" | "resendInvite"` and drops `simpleAction`. One `ConfirmDialog`, with per-kind title, body, label and tone from a lookup table instead of nested ternaries. Only `deactivate` and `reactivate` render the reason field.

5. **Role change in `UserForm`**: on submit for an existing user, if `!roleLocked` and the role changed, open a `ConfirmDialog` above the Sheet instead of submitting. Confirm runs the existing save path unchanged. This applies to promotion too, because `admin-service.ts` revokes the target's sessions on *any* role change (found during apply). Body copy differs: demote = loses admin access, promote = gains it. Profile-only edits and creation skip it. Radix stacks the alert dialog above the sheet's focus trap correctly.

6. **Session revoke copy names the device** (`"{device} · {browser}"`) so the user can tell which row they are about to kill.

7. **Copy.** New i18n keys under `confirm.*` (shared: `confirm.logout.title/body/action`) plus per-screen keys (`me.session.confirm*`, `users.dialog.revokeInvite*`, `users.dialog.resendInvite*`, `users.dialog.demote*`, `invite.logoutConfirm*`). Existing `users.dialog.*` and `me.logoutAllConfirm` keys stay. Confirm buttons switch from `common.confirm` to action-verb keys. `bn.ts` and `en.ts` must keep identical key sets (the existing i18n test enforces this).

**PRD deviation:** none. The Auth PRD only lists a confirm dialog for deactivate/reactivate. Adding confirms elsewhere is stricter, does not conflict, and matches design-system SKILL.md ("destructive or financial-final actions always go through a dialog").

## Risks / Trade-offs

- [Extra click on every logout annoys frequent users] → It is one keypress (Tab/Enter or click), and the user explicitly asked for it. Cancel-focused default protects against accidental Enter.
- [E2E tests that click Log out break] → Update `e2e/auth.spec.ts` helpers to confirm the dialog. Add an explicit cancel-path test.
- [AlertDialog inside a Sheet (role demotion) — focus-trap conflicts] → Cover with a component test that asserts focus lands on Cancel and returns to Save. Radix supports nested layers.
- [Visual regression baselines change] → Regenerate only the affected snapshots and add new ones for the logout and revoke-invite dialogs (desktop + 360px, bn/en).
- [Future devs bypass the component] → Saved as a project rule (agent memory) and stated in the spec. Optional follow-up: an ESLint rule. Not in this change.

## Migration Plan

UI-only, no data or API changes. It ships with the auth foundation branch, and reverting the commit restores the old behavior.
