# distribution-ui Specification

## Purpose

Gives every member a Distribution screen that shows how the month's distributable was reached and what each owner gets, and gives the Super Admin the close, reopen, reserve and pay actions — plus the close reminder on Home and the reserve rule in Settings. Follows the BariHisab design system, in বাংলা and English, from 360px up. (Distribution PRD §2.1, F1–F5, F7–F9, F12, F14 P1, F15, §9, §12)

## Requirements

### Requirement: Navigation
The app shell SHALL show "Distribution" (`/[lang]/distribution`) to users with `distribution.view` in the desktop sidebar and the mobile navigation, after Entries. (S5)

#### Scenario: Owner sees the nav item
- **WHEN** an Owner opens `/en`
- **THEN** "Distribution" links to `/en/distribution`

### Requirement: Month header and navigation
The page SHALL take the month from `?month=YYYY-MM` (default oldest open month) and show the month label, a status tag "Draft — not closed yet" or "Closed", the sub-line "Live preview — entitlements post when you close the month." (open) or "Closed by {Name} on {date}" plus "· reopened N×" (closed), and previous / next / month-list navigation that updates the URL. (F1, G7)

#### Scenario: Shareable link
- **WHEN** a user picks September in the month list
- **THEN** the URL becomes `?month=2026-09` and reloading shows September

### Requirement: Staircase display
The page SHALL show one ruled row of cells Income, − Expense, − Reserve, − Previous deficit and a yellow "Distributable =" cell with the amount in large type; on phones cells stack in pairs and Distributable is full width. Income and Expense cells link to Entries for the month on the matching tab; Reserve shows the rule used or the override and reason and the reserve balance; Previous deficit links to its source month. Notes appear only when they apply: deficit created (red, with the word "deficit"), reserve-paid amount (muted), reserve override (muted, with reason). (F2, F9, F10, §9)

#### Scenario: Deficit note
- **WHEN** April is shown
- **THEN** the Distributable cell shows ৳0 and the note reads "Expenses exceeded income — a deficit of ৳45,780 carries into next month."

### Requirement: Owner board display
On desktop the board SHALL be a table with columns Owner (initials, name linking to the owner statement filtered to the month, "You" tag), Share, Opening, Entitlement ("Entitlement (preview)" while open), Received, Advance, Loan ded., Other (only when any row is not 0), Balance ("Balance now" plus "after close ৳X" while open), Loan, and a Pay action; plus a totals row. On phones each owner SHALL be a card with initials, name, share, labelled balance at the top right, a grid of Opening, Entitlement, Received, Advance, Loan ded., Loan, and a full-width "Pay ৳X" button. Balances are coloured and labelled Owed / Advance outstanding / Settled. (F3, G13, Rule 16)

#### Scenario: Owner's own row
- **WHEN** Farzana opens October's preview
- **THEN** her row is tagged "You" and shows "Entitlement (preview)" ৳8,456.90 and "after close ৳17,160.80"

### Requirement: Accuracy footer display
Below the board the page SHALL show "Σ entitlements ৳X = distributable ৳X" with a check when balanced (red warning otherwise), "Shares used · {first name} {units} · …" and "Rounding · largest remainder, in paisa" with an info tip explaining the method. (F4)

#### Scenario: Footer
- **WHEN** October is shown
- **THEN** the footer reads "Σ entitlements ৳84,569 = distributable ৳84,569"

### Requirement: Role-aware actions
Close month, Reopen, Reserve override and Pay controls SHALL render only for users holding `period.close`, `period.reopen`, `reserve.override` and `payout.create` respectively. "Close month" shows only on an open month whose previous month is closed; otherwise the text "Close {Month} first — months close in order." links to that month. "Reopen" shows only on the latest closed month. Pay shows on rows with a positive balance when an open month exists. (§4, F5, F7, F12)

#### Scenario: Owner sees no controls
- **WHEN** an Owner opens October
- **THEN** no Close month, Reopen, reserve override or Pay control is present

### Requirement: Close month dialog
"Close month" SHALL open a dialog "Close month · {Month}" that loads the close preview and lists must-pass checks (✓ or red ✕) and warnings (amber ⚠), the "What happens" list and, for a reopened month, a "Changes since last close" table; "Close & lock" is disabled while any must-pass check fails. Confirming posts the close with the version; success shows the toast "{Month} closed · entitlements posted" and the page switches to the closed view; a `PERIOD_ALREADY_CLOSED` refusal shows its message. (F5, F8, G2, G12)

#### Scenario: Blocked by shares
- **WHEN** the shares check fails
- **THEN** "Close & lock" is disabled and the ✕ line reads "No shares set for {Month}. Set shares in Owners first."

### Requirement: Reopen dialog
"Reopen" SHALL open a destructive-action confirmation with the PRD text, the list and total of payouts/advances made since the close when any, and a required reason; confirming shows the toast "{Month} reopened · entitlements reversed · owners notified". A closed month that was reopened SHALL show a Reopened note per history row (date, by whom, reason) and a "See changes" toggle with the before → after table. (F7, F8, F15, G5)

#### Scenario: Reason required
- **WHEN** the reason is empty and Reopen month is pressed
- **THEN** the field shows "Please write a reason — everyone can see it." and nothing is sent

### Requirement: Reserve override dialog
On an open month the Reserve cell detail SHALL offer "Reserve for this month" (amount, required reason) and "Reset to rule" to users with `reserve.override`. (F9, G3)

#### Scenario: Override saved
- **WHEN** a Super Admin sets ৳10,000 with a reason
- **THEN** the staircase updates and the note shows "Reserve set to ৳10,000 for this month · {reason}"

### Requirement: Pay from the board
Pay SHALL open the Owners pay drawer pre-filled with the owner and full positive balance; after saving the board refreshes Received and Balance. (F12)

#### Scenario: Pay Farzana
- **WHEN** a Super Admin pays Farzana's full balance from the board
- **THEN** her Balance shows Settled after save

### Requirement: Home close reminder
The Home page SHALL show users with `dashboard.admin` a Close-the-month reminder strip when a month earlier than the current Asia/Dhaka month is open: "Close-the-month reminder. {Month} is open." plus unpaid units ("Flat 3A (Nusrat Jahan) has not paid rent yet.") and a **Review distribution** link to that month. It is the most urgent Home reminder (at most two strips show) and can be hidden for the day with **Hide today**. (F14 P1; Home PRD F6, G4)

#### Scenario: October still open in November
- **WHEN** a Super Admin opens Home on 2026-11-03 with October open
- **THEN** the strip reads "Close-the-month reminder. October 2026 is open." and links to `/en/distribution?month=2026-10`

#### Scenario: Hidden for today
- **WHEN** the Super Admin hid the strip on 2026-11-03 and reopens Home the same day
- **THEN** the strip is not shown, and it returns on 2026-11-04 while October is still open

### Requirement: Settings reserve section
Settings SHALL show users with `settings.manage` a Reserve holdback section: Off / Percent / Fixed, the percent or fixed amount, starting reserve, and "Reserve balance now ৳X". (F9, SET-02)

#### Scenario: Save percent
- **WHEN** a Super Admin selects Percent 5 and saves
- **THEN** the section shows the saved rule and the toast "Saved"

### Requirement: Empty states, language and width
The page SHALL show "Your first month opens when setup is finished." when no period exists and "No owners have shares for {Month}." with a Set shares link (Super Admin) when the board is empty. Every string exists in বাংলা and English, amounts use ৳ with lakh grouping and Bangla digits in Bangla, and the page works at 360px without horizontal page scroll. (§9, Rule 15, §12 General)

#### Scenario: Bangla at 360px
- **WHEN** the page is opened at `/bn/distribution` at 360px width
- **THEN** labels are Bangla, amounts use Bangla digits and the board renders as cards
