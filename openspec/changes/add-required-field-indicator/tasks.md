## 1. Shared primitive (test-first)

- [x] 1.1 Write failing tests in `components/forms/forms.test.tsx`: `TextField`, `PasswordField` and `SelectField` with `required` set `data-required="true"` on the label, forward `required` to the control, and keep the accessible name exactly equal to the label (`getByRole(..., { name: "Email" })`). Without `required`: no `data-required` attribute.
- [x] 1.2 Write failing tests for `DateField` `required` + `requiredText`: label has `data-required="true"`, and trigger `aria-describedby` starts with `{id}-required`, whose text is `requiredText`, followed by the hint/error ids. Not required: no such id.
- [x] 1.3 Write failing tests for `RequiredLegend` (renders `* {text}`, `aria-hidden="true"`, `text-xs`) and for `requiredProps(true|false)`.
- [x] 1.4 Implement `required` handling in `TextField`, `PasswordField`, `SelectField` and `DateField`, plus `requiredProps` and `RequiredLegend`, in `components/forms/fields.tsx` (design D2–D5). Tests in 1.1–1.3 pass.
- [x] 1.5 Add the `[data-slot=field-label|field-legend][data-required=true]::after { content: "*" / "" }` rule to `app/globals.css` using `--color-text` and weight 800 (design D1). Confirm in the running dev app (Chrome DevTools accessibility pane) that the label's computed name excludes `*`.
- [x] 1.6 Legend text: reuse the existing `common.required` key (en "Required", bn "আবশ্যক") instead of adding a duplicate `form.requiredLegend`. No i18n file change needed.

## 2. Drift guard helper (test-first)

- [x] 2.1 Write `tests/ui/required-helper.test.tsx` (the `ui` vitest project only includes `tests/ui/**`): the helper fails on (a) an input with `required` whose label lacks `data-required`, (b) a `data-required` label whose input lacks `required`, (c) a required `DateField` missing its description. It passes on a correctly marked form.
- [x] 2.2 Implement `expectRequiredMarkersMatch(container)` in `tests/helpers/required.ts` (design D7). 2.1 passes.

## 3. Auth & profile forms

- [x] 3.1 Failing tests: Login (identifier and password marked, no legend), Forgot (email marked), Reset and Accept invite (both password fields marked, invite username unmarked, no legend). Each calls `expectRequiredMarkersMatch`.
- [x] 3.2 Update `LoginForm`, `ForgotForm`, `PasswordPair` (forms already pass `required` → only verify the label marker appears) and `AcceptInviteForm`. Tests in 3.1 pass.
- [x] 3.3 Failing tests for `/me`: as Super Admin, Username and Email are marked and the legend shows. As Owner (read-only), neither is marked. In the password form, Current, New and Repeat are marked with no legend.
- [x] 3.4 Update `components/me/MeScreen.tsx`: `required={canIdentity}` on Username and Email, `required` on Current password, `RequiredLegend` in the profile form. Tests in 3.3 pass.
- [x] 3.5 Failing tests for the user drawer: Username, Email and Role are marked, the legend shows, other fields are unmarked, and label text no longer contains a literal `" *"`.
- [x] 3.6 Update `components/users/UserForm.tsx`: remove the hard-coded `` ` *` `` from the three labels, add `required` to the Role select, add `RequiredLegend`. Update the deactivate/reactivate reason in `UsersManager.tsx` if needed (it already passes `required`). Tests in 3.5 pass.

## 4. Income & expenses forms

- [x] 4.1 Failing tests in the EntryDrawer tests: new income with category Rent marks Month, Category, Amount (৳), Date, Fund account and Unit. Switching to a non-rent income category unmarks Unit. ARREAR shows a marked Reference month. Expense marks the base five and leaves Vendor, Description and Reserve unmarked. Correct mode marks "Why the correction?". The legend shows. `expectRequiredMarkersMatch` is called in each state.
- [x] 4.2 Failing test: submitting the entry drawer with Amount empty shows the existing inline amount error, and the form stays `noValidate` (no native bubble).
- [x] 4.3 Update `components/entries/EntryDrawer.tsx`: `required` on the Period, Category, Date and Fund selects/fields. Amount uses `requiredProps(true)` on `FieldLabel` and `required` on `Input`. Unit gets `required={unit is required for the current category}`, and Reference gets `required={needsReference}`, reusing existing booleans (design D6). Pass `requiredText={tr("common.required")}` to `DateField`. Add `RequiredLegend`. Tests in 4.1–4.2 pass.
- [x] 4.4 Failing tests and update: void reason in `DetailDrawer.tsx` is marked. Generate-rent Date in `GenerateRentDialog.tsx` is marked via `DateField required`. Row inputs stay unmarked (out of scope).

## 5. Settings forms

- [x] 5.1 Failing tests in the settings tests: unit drawer marks Unit name, leaves Tenant, Monthly rent and Default fund unmarked, and shows the legend. Fund drawer marks Name, Type and Opening date, leaves Opening balance unmarked, and shows the legend. Category drawer marks both names, with no legend. (Rent and Opening balance accept empty as ৳0, so by the spec rule they are not required.)
- [x] 5.2 Update `components/settings/SettingsView.tsx`: add `required` to fund Type and Opening date (with `requiredText`). Add `RequiredLegend` to the unit and fund drawers. Tests in 5.1 pass.

## 6. Verification

- [x] 6.1 Search for leftover literal stars in labels (`grep -rn '} \*\`' components`) and any `label=` built with `"*"`. There must be none.
- [x] 6.2 Run `pnpm test` (all vitest suites), `pnpm typecheck` and `pnpm lint`. All green.
- [x] 6.3 Run Playwright E2E. Existing `getByLabel` selectors still pass unchanged, which proves the accessible names are unaffected.
- [x] 6.4 Refresh the visual baselines in `e2e/visual.spec.ts` (desktop + 360px, en + bn). Review the diff images to confirm only the `*` and the legend changed.
- [x] 6.5 Manually check one form at 360px in both languages (entry drawer). Take a screenshot to `.context/` showing the stars and the legend, following the design system (ink star, no new color).
- [x] 6.6 No new endpoints in this change. Confirm `/api/v1/openapi.json` is unchanged (Swagger registration not applicable).
