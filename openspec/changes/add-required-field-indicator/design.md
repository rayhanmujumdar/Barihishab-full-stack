## Context

- All labelled inputs go through `components/forms/fields.tsx` (`TextField`, `PasswordField`, `SelectField`, `DateField`), which wrap shadcn `Field` / `FieldLabel`. Exceptions: the entry drawer's Amount (raw `FieldLabel` + `Input`, for the 56px amount style) and the accept-invite language `FieldLegend`.
- `required` is passed through `...input` / `...select` to the native control today, but the label never reflects it. `UserForm.tsx` hard-codes `` `${tr(...)} *` `` into three labels.
- `DateField`'s control is a `<button>` (Popover trigger) labelled by `aria-labelledby="{id}-label {id}-value"`. A button cannot take `required` or `aria-required`.
- Several forms use `noValidate` (Login, User drawer, `/me` profile, Entry drawer, Settings), so adding `required` there causes no native validation bubbles. Forgot, Reset, Accept invite and `/me` password do not use `noValidate`, but their inputs already carry `required` (PasswordPair, Forgot email). The only new `required` among them is `/me` Current password, whose submit button is already disabled while it is empty.
- Many tests use `getByLabelText("Email")` / Playwright `getByLabel(...)`. Testing Library matches label `textContent`, so adding a literal `*` text node to labels would break many of them.

## Goals / Non-Goals

**Goals:**
- One primitive owns the marker. Forms only state *which* fields are required.
- The accessible name and every existing label-based test selector stay unchanged.
- A reusable test assertion catches drift between the marker and the real `required` state.

**Non-Goals:**
- No new form library and no switch to native HTML validation UX.
- No restyle of labels beyond adding the marker.

## Decisions

### D1 — Render the star with CSS `::after` and empty alt text, not a DOM text node
`FieldLabel` gets `data-required="true"`. A rule in `app/globals.css` adds the star:

```css
[data-slot="field-label"][data-required="true"]::after,
[data-slot="field-legend"][data-required="true"]::after {
  content: "*" / "";          /* alt text "" → excluded from accessible name */
  margin-inline-start: 2px;
  color: var(--color-text);
  font-weight: 800;
}
```

- **Why**: label `textContent` and the accessible name stay byte-identical, so `getByLabelText("Email")` and Playwright `getByLabel` keep working without touching any existing selector. The `content: <string> / <alt>` syntax keeps the glyph out of accname in Chromium, WebKit and Firefox 128+.
- **Alternative: `<span aria-hidden>*</span>` inside the label.** It stays out of the accessible name, but it changes `textContent` → mass test churn (`getByLabelText` exact match fails). Rejected.
- **Alternative: append `*` to i18n strings** (current UserForm approach). Mixes presentation into translations, gets out of sync with `required`, and changes the accessible name. Rejected, and the existing three cases are removed.
- **Testability**: jsdom does not render `::after`, so unit tests assert `data-required="true"` on the label (the contract the CSS reads). Playwright visual baselines verify the visible glyph.

### D2 — `required` prop drives both the marker and the semantics
`TextField` / `PasswordField` / `SelectField` read `required` from their props, set `data-required` on `FieldLabel`, and still forward `required` to the control. One prop means the two cannot diverge. This is what the spec's "marker and semantics always match" requirement depends on.

### D3 — `DateField` gets `required?: boolean` and a hidden description
When `required` is set, `DateField` renders `<span id="{id}-required" className="sr-only">{requiredText}</span>` and prepends `{id}-required` to `aria-describedby`. `requiredText` is a new prop (forms pass `tr("common.required")`), the same way `clearLabel` is injected today. `fields.tsx` stays free of i18n imports.
- **Alternative: `aria-required` on the trigger.** Invalid ARIA on `role=button` (axe flags it). Rejected.

### D4 — Custom fields reuse the same attribute
The entry Amount `FieldLabel` and any `FieldLegend` take `data-required` directly. The Amount `<Input>` gets `required`. A small exported `requiredProps(required)` helper in `fields.tsx` returns `{ "data-required": required || undefined }` so call sites don't hand-write the attribute.

### D5 — Legend as a tiny component
`RequiredLegend` (in `components/forms/fields.tsx`) renders `<p className="text-xs text-muted-foreground" aria-hidden="true">* {text}</p>`. It is `aria-hidden` because AT already gets "required" per field, so reading the legend would be redundant noise. Forms that mix required and optional fields render it as the first child of the form body (User drawer, `/me` profile, Entry drawer, Settings unit and fund drawers; `/me` profile only for Super Admins, whose username and email are editable). Forms where all editable fields are required skip it (Login, Forgot, Reset, Accept invite, `/me` password, void/deactivate dialogs, Settings category, Generate rent). The choice is static per form: no runtime counting, so it can't flicker as conditional fields appear.
- Legend text reuses the existing `common.required` key (en "Required", bn "আবশ্যক"). The `*` is prepended in the component so the glyph never lives in translations.

### D6 — Conditional required is expressed with the same boolean the form already computes
`EntryDrawer` already computes `needsReference`, and decides when Unit is shown and validated for RENT/ARREAR. Those same booleans feed `required={...}`. No new state.

### D7 — Drift guard test helper
`tests/helpers/required.ts` exports `expectRequiredMarkersMatch(container)`. It collects every `input, select, textarea` with `required`, plus every element whose `aria-describedby` points to a `[id$="-required"]` node. For each, it resolves the label (`label[for=id]` or `aria-labelledby` first id) and asserts that `data-required="true"` is present. In the other direction, every `[data-required="true"]` label must resolve to such a control. Each form's component test calls it in its main states (create, edit, correct, rent-vs-other category).

### PRD deviation
None. The PRDs don't specify a required marker. This change only exposes their existing required rules visually.

## Risks / Trade-offs

- [Old browsers without `content: x / ""` drop the whole declaration, so no star appears] → Supported in every evergreen engine the app targets. Native `required` still conveys the state, so this is cosmetic degradation only. Optional: add a plain `content: "*"` fallback line before the alt-text line. The fallback would be announced as "star" only on those old engines, which we accept.
- [Server marks a field required but the UI omits `required`] → The inventory in the spec plus a per-form test that asserts each listed field is marked. The drift helper catches mismatches between marker and semantics, not between UI and server, so the inventory table is the source for those.
- [Visual baselines change on every form screen] → One deliberate baseline refresh task. Review the diff images to confirm only the star changed.
- [Adding `required` to a form without `noValidate` reintroduces native bubbles] → The only such new case is `/me` Current password, which is guarded by the disabled submit button. The task checklist verifies each form's `noValidate` status.

## Migration Plan

UI-only and fully reversible: revert the commit. No data, API or permission changes.
