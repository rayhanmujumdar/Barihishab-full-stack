# entries-ui Specification

## Purpose

The bilingual, mobile-first screens through which the Super Admin records a month's money and every owner inspects it: the Income & Expenses list, entry and detail drawers, void and Generate-rent dialogs, and Settings for master data. (Income & Expenses PRD §2.1, §5, §6, §13 Mobile/Accessibility/Localization)

## Requirements

### Requirement: Navigation entries
The app shell SHALL show "Income & expenses" (`/[lang]/entries`) to users with `transaction.view` and "Settings" (`/[lang]/settings`) to users with any of `unit.manage`, `fund.manage`, `category.manage`, in both the desktop sidebar and the mobile navigation.

#### Scenario: Owner nav
- **WHEN** an Owner views the shell
- **THEN** "Income & expenses" is shown and "Settings" is not

### Requirement: Income & Expenses list screen
`/[lang]/entries?period=YYYY-MM&type=INCOME|EXPENSE&category=<code>|ALL` SHALL render for `transaction.view` (others see the Forbidden screen) with: kicker = month label; H1 "Income & expenses"; a month picker (prev/next across existing periods, lock icon on Closed, **Draft** tag on Open); two tab buttons (`aria-pressed`) "Income · N entries · ৳total" and "Expense · …"; category chips "All" + only categories with entries this month, reset to All on tab switch; rows sorted date desc showing date, category with tags (Void, Corrected, From reserve, 📎 count), description, meta (vendor · fund account) and right-aligned amount, voided rows struck through and muted; a footer "Total · {label}" excluding voided rows; empty states "No income added for {Month} yet." (with **Generate this month's rent** for admins in an Open month) and "No expenses recorded for {Month} yet."; and 6 skeleton rows while loading. Missing or unknown `period` defaults to the latest Open month. The URL MUST carry `period`, `type` and `category` so a link reopens the same view. (LST-01..05, §6.1)

#### Scenario: Shareable view
- **WHEN** a user opens `/en/entries?period=2026-10&type=EXPENSE&category=ELEC`
- **THEN** October's Expense tab is active with the Electricity chip selected and the footer reads "Total · Electricity"

#### Scenario: Voided row
- **WHEN** an entry is voided
- **THEN** its row is struck through with a **Void** tag and the tab and footer totals exclude it

### Requirement: Role- and status-aware actions
Header buttons **Generate rent**, **+ Income** (secondary) and **+ Expense** (primary) SHALL show only for users with `transaction.create` and only when the month is Open. A Closed month SHALL show the lock banner "{Month} is closed and locked. Corrections go in the open month as an Adjustment…", with the reopen hint only for Super Admins, and no create/correct/void controls. Under 860 px the header buttons SHALL collapse into the yellow + FAB (Expense) and a "⋯" menu (Income, Generate rent). (§2.1, §6.1, LCK-01)

#### Scenario: Owner read-only
- **WHEN** an Owner opens an Open month
- **THEN** no Generate rent, + Income, + Expense, Correct or Void controls are present

#### Scenario: Closed month
- **WHEN** a Super Admin opens a Closed month
- **THEN** the lock banner is shown and no create buttons are present

### Requirement: Entry drawer (create and correct)
The entry drawer (right side, `min(540px, 100vw)`, full screen under 560 px) SHALL offer a type segment Income/Expense (hidden when correcting), Month (Open months only, default latest Open), Category (active categories of the kind, excluding `OWNER_GRANT` and adjustment categories; default Rent for income / last used for expense), Reference month (Closed months only, shown for Arrear), Amount ৳ (large numeric input accepting `6,300` and Bangla digits), Date (date picker, default today), Fund account (each option showing its balance; default unit default / last used), Unit (income; required for Rent/Arrear), Payee/vendor with autocomplete (expense), "Paid from the Reserve" checkbox (expense), Description (≤ 200), attachments box ("JPG, PNG, WebP or PDF · up to 5 files, 5 MB each", thumbnails with remove ✕), and in correct mode a required "Why the correction? (saved to the audit log)". Field errors MUST render under their field linked by `aria-describedby`; live soft warnings (fund would go negative, date far from month) and server warnings MUST render in the alert strip without blocking save. Save labels are "Save income", "Save expense", "Save correction". Each save attempt MUST reuse one Idempotency-Key per open drawer so a double tap creates one entry; on success a toast like "Expense of ৳6,300 added to October 2026" shows and the list and totals refresh; on failure the drawer keeps the input and offers retry. (§5.2, §6.2, COR-01, DUP-01)

#### Scenario: Add an expense
- **WHEN** a Super Admin enters 6,300 for Electricity from DESCO and saves
- **THEN** the toast "Expense of ৳6,300 added to October 2026" shows and the Expense tab total grows by ৳6,300

#### Scenario: Correction requires a reason
- **WHEN** the admin saves a correction with an empty reason
- **THEN** the reason field shows "Write a short reason — every owner can see it." and nothing is sent

### Requirement: Detail drawer and void dialog
Tapping a row (rows are buttons) SHALL open a detail drawer with kicker Income/Expense, category title, large amount, tags (**Void · {reason}**, **Corrected**, **🔒 Locked month**), key–value rows (Month, Date, Fund account, Unit, Payee/vendor, Description, Paid from Reserve, Reference month, Recorded by; empty rows hidden), **Bills & receipts** thumbnails opening a 5-minute signed URL (PDF in a new tab), and a **History** timeline (created, then each update/void/attachment change with before → after and reason). For `transaction.update`/`transaction.void` holders in an Open month on a non-voided entry it SHALL show **Correct** (primary) and **Void** (secondary). Void SHALL open a confirmation dialog "Void this entry?" with the body from PRD §2.1 and a required Reason (min 5 chars); **Void entry** stays disabled until valid. (DET-01, VOD-01, §6.3–6.4, destructive-action-confirm)

#### Scenario: Void flow
- **WHEN** an admin voids an entry with reason "Duplicate entry"
- **THEN** the dialog closes, the row shows **Void**, and the detail shows **Void · Duplicate entry**

### Requirement: Generate rent dialog
**Generate rent** SHALL open a dialog "Generate rent · {Month}" with the body "Drafted from each unit's set rent. Adjust anything, untick units that haven't paid, then save.", one row per previewed unit (checkbox, unit + tenant, 140 px amount input), a ruled **Total** of ticked rows, and **Cancel** / **Save rent entries**. With nothing to draft it SHALL show "Every active unit already has rent recorded this month." and **Done**. After save a toast reports created and skipped units. (INC-04, §6.5)

#### Scenario: Untick an unpaid unit
- **WHEN** the admin unticks Flat 3A and saves 5 rows
- **THEN** 5 rent rows appear in the list and reopening the dialog lists only Flat 3A

### Requirement: Settings master-data screens
`/[lang]/settings` SHALL show sections Units, Fund accounts, Income categories and Expense categories to users holding the matching manage permission (others get the Forbidden screen). Units: name, rent ৳, tenant, default fund, active — add, edit, deactivate. Fund accounts: name, type, opening balance, opening date, live balance, active — add, edit, deactivate (refusal shown when balance ≠ 0). Categories: English name, Bangla name, active checkbox, **System** tag; system rows cannot be renamed or deactivated. Every deactivate MUST ask for confirmation first. (MST-01..03, §6.6)

#### Scenario: Add a category
- **WHEN** an admin adds expense category "Internet" / "ইন্টারনেট"
- **THEN** it appears in the list and in the entry drawer's Expense categories

### Requirement: Bilingual and mobile ready
Every label, message, category name, month name and number on these screens SHALL render in Bangla or English per the active locale (Bangla digits and month names, lakh grouping), and every screen SHALL be usable at 360 px wide with 44 px touch targets. (I18N-01, §13)

#### Scenario: Bangla list
- **WHEN** the list is opened at `/bn/entries?period=2026-10`
- **THEN** the kicker reads `অক্টোবর ২০২৬` and amounts show Bangla digits
