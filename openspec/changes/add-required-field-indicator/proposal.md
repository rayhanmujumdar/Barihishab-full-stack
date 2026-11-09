## Why

Users cannot tell which form fields must be filled before submitting. Today only the user drawer shows a `*`, and it is typed into the translated label text (`users.field.username` + `" *"`). Every other form (login, entry drawer, settings drawers, void reason, profile) shows nothing, so users learn a field was required only after a failed submit. A consistent, accessible required marker fixes this. It also covers WCAG 2.2 SC 3.3.2 (Labels or Instructions) and the Auth PRD §8 Accessibility rules that the auth screens already follow.

## What Changes

- Add one shared required-field marker: a `*` after the visible label of every field the user must fill before the form can be submitted.
- The shared form fields (`TextField`, `PasswordField`, `SelectField`, `DateField` in `components/forms/fields.tsx`) render the marker when they get the `required` prop. Custom fields (the entry amount input, fieldset legends) use the same primitive.
- The marker is decoration only. It MUST NOT change a field's accessible name, so screen readers do not announce "Email star". "Required" reaches assistive tech through native `required` (inputs and selects), or through a localized "Required" description on the `DateField` trigger button, which cannot take `aria-required`.
- Conditionally required fields show the marker only while the condition holds: Unit for RENT/ARREAR income, Reference month for ARREAR/ADJUSTMENT, and Correction reason in correct mode.
- A short bilingual legend ("* Required" / "* আবশ্যক") appears at the top of any form that mixes required and optional fields.
- Remove the hard-coded `" *"` from the user drawer labels (Username, Email, Role) and use the shared marker instead.
- Mark every field the server or client rejects when empty, across all current forms. Today the following are required but unmarked and lack `required`: entry Period, Category, Amount, Date, Fund; fund Type, Opening date; generate-rent Date; login, forgot and reset inputs (they have `required` but no marker).
- Add a test helper that checks the marker and the real `required` semantics always match: no required control without a marker, and no marker without a required control.

## Capabilities

### New Capabilities

- `form-required-indicator`: The visual and accessible contract for marking required form fields: the marker, when it shows, how it stays out of the accessible name, the legend, conditional fields, and which fields count as required in each existing form.

### Modified Capabilities

<!-- None. auth-ui's "Design system and accessibility compliance" requirement stays as written. This change adds a cross-cutting capability and does not rewrite auth-ui requirements. -->

## PRD coverage

- **Auth PRD §8 Accessibility**: every field has a real `<label>`. The required state is now also visible.
- **Income & Expenses PRD §"Entry form" field table and validation table**: Unit is required for RENT/ARREAR, `reference_period` is required for ARREAR/ADJUSTMENT, the reason is required for correct, void and adjust (G1, G3, COR-01, VOD-01). These rules are now visible before submit.
- **Auth PRD USR-01 / USR-03**: user drawer required fields (username, email, role) and the required deactivate reason.
- No PRD requirement ID covers the marker itself. It is a UX and accessibility improvement layered on the existing requirements, with no conflict with the PRD.

## Out of scope

- Changing which fields are required. Server zod schemas and client validation stay as they are. This change only exposes the existing rules.
- Inline per-row inputs in the Generate-rent table (amount and fund per unit). They have no visible label, only `aria-label`, and act as table cells, not form fields.
- Filter and search inputs (Users search, role and status filters). They are never required.
- Read-only fields (invite username, Owner's locked username and email on `/me`). The user cannot edit them, so they show no marker.
- New validation messages, or moving errors to submit-time vs live.

## Impact

- **Code**: `components/forms/fields.tsx` (marker + `required` handling), `components/ui/field.tsx` or `app/globals.css` (marker style), the forms in `components/auth/*`, `components/users/UserForm.tsx`, `components/users/UsersManager.tsx`, `components/me/MeScreen.tsx`, `components/entries/EntryDrawer.tsx`, `components/entries/DetailDrawer.tsx`, `components/entries/GenerateRentDialog.tsx`, `components/settings/SettingsView.tsx`.
- **i18n**: none. The existing `common.required` key is reused for the legend and the screen-reader description.
- **Tests**: component tests per form plus a shared `expectRequiredMarkersMatch` helper. Playwright visual baselines (`e2e/visual.spec.ts`) need updating because labels gain a `*`.
- **APIs / DB**: none.
- **Dependencies**: none.
