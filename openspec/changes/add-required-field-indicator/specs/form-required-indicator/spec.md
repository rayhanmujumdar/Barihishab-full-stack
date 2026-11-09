## Purpose

Makes required form fields recognisable before submit. Every field the user must fill carries a consistent, bilingual-safe `*` marker after its visible label. The marker matches the field's real required semantics and stays accessible to screen-reader users.

## ADDED Requirements

### Requirement: Required fields show an asterisk after the label
Every editable form field that must have a value before its form can be submitted SHALL show a `*` immediately after its visible label text, on the same line. A field is required when the server schema or the client-side validation for that form rejects an empty value in the current form context. Optional fields, read-only fields and disabled fields MUST NOT show the marker. The marker MUST use design-system tokens only: ink text color, the label's font size, weight 800, no new color. It MUST look the same in English and বাংলা.

#### Scenario: Required text field is marked
- **WHEN** the Settings "Add unit" drawer opens
- **THEN** the "Unit name" label is followed by `*`
- **AND** the "Tenant name" label has no `*`

#### Scenario: Read-only field is not marked
- **WHEN** an Owner views `/me` with username and email read-only
- **THEN** the Username and Email labels show no `*`

#### Scenario: Same marker in Bangla
- **WHEN** the entry drawer is shown with locale `bn`
- **THEN** the "পরিমাণ (৳)" label is followed by the same `*` marker as in English

### Requirement: Marker does not alter the accessible name
The `*` marker MUST NOT be part of the field's accessible name. A field labelled "Email" SHALL still have the accessible name "Email", not "Email *" or "Email star". The required state SHALL reach assistive technology another way. Native inputs, selects and textareas MUST carry the `required` attribute. Controls that cannot carry `required` or `aria-required` (the date-picker trigger button) MUST expose a localized "Required" / "আবশ্যক" text through `aria-describedby`.

#### Scenario: Screen reader name excludes the star
- **WHEN** the login form renders
- **THEN** the identifier input's accessible name equals the translated label with no `*`
- **AND** the input has the `required` attribute

#### Scenario: Required date picker is described as required
- **WHEN** the entry drawer renders the Date field
- **THEN** the date trigger button's `aria-describedby` references an element whose text is the localized "Required"
- **AND** the visible label shows `*`

### Requirement: Marker and required semantics always match
Every rendered form control that carries `required` (or the date-picker "Required" description) MUST have a visible `*` marker on its label. Every visible `*` marker MUST belong to a control with that required semantics. A marked field the browser treats as optional, or a required control without a marker, is a defect.

#### Scenario: No unmarked required control
- **WHEN** any form in the app renders in any state
- **THEN** each control with `required` has a label carrying the marker

#### Scenario: No marker on an optional control
- **WHEN** any form in the app renders in any state
- **THEN** each label carrying the marker belongs to a control with `required` or the date-picker "Required" description

### Requirement: Conditionally required fields toggle the marker
A field that is required only in some states SHALL show the marker, and carry required semantics, only while the condition holds. When the condition stops holding, the marker and required semantics MUST be removed together.

#### Scenario: Unit becomes required for rent income
- **WHEN** an income entry's category is changed to Rent (RENT)
- **THEN** the Unit field shows `*` and is required
- **AND** when the category is changed to a non-rent income category, the Unit field shows no `*` and is not required

#### Scenario: Reference month for arrears
- **WHEN** an income entry's category is Arrear rent (ARREAR)
- **THEN** the Reference month field appears with `*` and is required

#### Scenario: Correction reason only when correcting
- **WHEN** the entry drawer opens in correct mode
- **THEN** "Why the correction?" shows `*` and is required
- **AND** in create mode that field is not rendered

### Requirement: Legend explains the marker on mixed forms
A form that has both required and optional fields SHALL show a one-line legend at the top of the form body: "* Required" in English, "* আবশ্যক" in বাংলা, in 12px neutral-700 text. A form whose editable fields are all required, or all optional, MUST NOT show the legend.

#### Scenario: Legend on the user drawer
- **WHEN** a Super Admin opens the "New user" drawer
- **THEN** "* Required" appears above the first field

#### Scenario: No legend on the login form
- **WHEN** the login form renders (identifier and password are both required, and "Remember me" is a checkbox with no required state)
- **THEN** no required legend is shown

### Requirement: Required field inventory
The following fields SHALL be marked required. Every other editable field in these forms SHALL be unmarked.

| Form | Required fields |
| --- | --- |
| Login | Username or email, Password |
| Forgot password | Email |
| Reset password / Accept invite | New password, Repeat password |
| `/me` profile | Username and Email only when editable (Super Admin) |
| `/me` change password | Current password, New password, Repeat password |
| User drawer (create/edit) | Username, Email, Role |
| Deactivate / reactivate dialog | Reason |
| Entry drawer | Month, Category, Amount (৳), Date, Fund account; Unit when category is RENT or ARREAR; Reference month when category is ARREAR or ADJUSTMENT; Why the correction? in correct mode |
| Void dialog | Reason |
| Generate rent dialog | Date |
| Settings: unit | Unit name (Monthly rent is optional: empty saves ৳0) |
| Settings: fund account | Name, Type, Opening date (Opening balance is optional: empty saves ৳0) |
| Settings: category | Name (English), Name (বাংলা) |

#### Scenario: Entry drawer income defaults
- **WHEN** the entry drawer opens for a new income with category Rent
- **THEN** Month, Category, Amount (৳), Date, Fund account and Unit show `*`
- **AND** Description and Attachments show no `*`

#### Scenario: Fund account drawer
- **WHEN** the Settings "Add fund account" drawer opens
- **THEN** Name, Type and Opening date show `*`
- **AND** Opening balance shows no `*`, because an empty value is saved as 0 paisa

#### Scenario: Submitting an empty required amount still uses inline errors
- **WHEN** a user submits the entry drawer with Amount empty (0 paisa)
- **THEN** the form shows the existing inline amount error under the field
- **AND** no native browser validation bubble appears
