# owners-ui Specification

## Purpose

Gives every member an Owners screen that shows every owner's share, balance and loan, and an owner detail page with a line-by-line statement they can save as a PDF. Gives the Super Admin the actions to change shares, add or edit owners, set opening balances, pay, record advances, void and adjust. Everything follows the BariHisab design system, in বাংলা and English, from 360px up. (Owners PRD §2.1, F1–F14, F17, §8)

## Requirements

### Requirement: Navigation and home shortcut
The app shell SHALL show "Owners" (`/[lang]/owners`) to users with `owner.view` in both the desktop sidebar and the mobile navigation. The home page SHALL show a "Statement →" link to the viewer's own owner detail when the viewer is linked to an owner, and no link otherwise. (F17)

#### Scenario: Owner sees nav and shortcut
- **WHEN** an Owner linked to an owner record opens `/en`
- **THEN** "Owners" is in the navigation and "Statement →" links to `/en/owners/{theirOwnerId}`

### Requirement: Owner list screen
`/[lang]/owners` SHALL show a kicker "{House name} · {total} share units", the title "Owners", and one card per current or new owner in display order: square initials avatar, name, responsibility, share % in large type (1 decimal, Bangla digits in বাংলা), tags (You, Super Admin, Invite pending, No login, "{n} units"), balance label + amount (Owed green / Advance outstanding red / Settled ink-on-grey, always with the word), and loan outstanding or "None". Each card MUST be a link to the owner detail. Cards form a ruled grid: 1 column under 860px, 2–3 above. On phones the viewer's own card MUST be shown first while other cards keep their order. A "Former owners" section/link appears only when there are former owners, listing each with last balance and the month they left. A "Share timeline" link opens the house's share sets (effective month, each owner's units and %, reason, saved by). When there are no owners, show "No owners yet. Add the first owner, then give everyone their shares." with **Add owner** for Super Admins. (F1, F5, F9, F17, §8)

#### Scenario: Cards for the sample house
- **WHEN** an Owner opens `/en/owners` for the PRD §2.2 sample
- **THEN** five cards appear in display order, the viewer's card is tagged "You", Tanvir shows "Owed ৳8,055.85" and loan "৳35,000", and Nasrin shows "Advance outstanding ৳5,000"

#### Scenario: No former owners
- **WHEN** no owner is former
- **THEN** no "Former owners" link or section is rendered

### Requirement: Role-aware owner actions
Super Admins SHALL see **Change shares** and **Add owner** on the list, and on the detail **Pay** (primary), **Record advance**, and a **More** menu with **Balance adjustment**, **Edit owner** and **Opening balance** (the last only while no month is closed). Pay and Record advance MUST be disabled with the hint "Open a month first" when no month is open. Owners MUST see none of these controls (and the server refuses them regardless). (§4, F2, Acceptance "An Owner sees no Pay, Advance, Void, Change shares, Add owner or Edit buttons")

#### Scenario: Owner sees no admin controls
- **WHEN** an Owner opens any owner detail
- **THEN** there is no Pay, Record advance, More, Void, Change shares or Add owner control

#### Scenario: No open month
- **WHEN** every period is closed and a Super Admin opens a detail
- **THEN** Pay and Record advance are disabled and show "Open a month first"

### Requirement: Owner detail and summary
`/[lang]/owners/[id]` SHALL show "← All owners", the initials, kicker "Owner statement · {responsibility}", name, email · phone (when present), and a ruled summary strip: Balance (label + colour), Share (% and units), Entitlement {year}, Paid out {year}, Loan (amount or "None"). A year switcher (default current year) changes the two yearly figures. The owner's share history is listed newest first as "From {month} · {units} units · {reason}" with who made the change. An unknown id renders the not-found view. (F2, F5, G4)

#### Scenario: Year switcher
- **WHEN** the viewer picks 2025 in the year switcher
- **THEN** Entitlement and Paid out show 2025 totals and the URL keeps the choice (`?year=2025`)

### Requirement: Statement view
The detail SHALL show the statement with **From** / **To** month pickers (To offers every month up to the latest open month plus **Latest**; default January of this year → Latest) reflected in the URL, and a table: Date · Month · Type · Note (+ reference no., "for {month}" on adjustments, Self / Flagged tags) · Amount (+ green, − ink) · Running balance (coloured by sign, with word on the closing row). The first row is **Brought forward** and the last **Closing balance**. Voided rows stay, struck through in neutral-600 with a **Void** tag. Super Admins see **Void** on non-voided Payout and Advance rows when a month is open. Selecting a row opens a detail panel: recorded by, when, fund account, method, reference no., receipt files, void reason, and for reversals a link to the original. The legend reads "Positive = the house owes this owner. Negative = advance outstanding. Voided entries stay visible; their reversal cancels them." An empty range shows "No entries between {From} and {To}." with brought forward and closing still shown. Under 860px the table scrolls sideways with Date, Type and Amount readable without scrolling. (F3, G6, §8)

#### Scenario: Voided payout shown
- **WHEN** a statement contains a voided payout and its reversal
- **THEN** the payout row is struck through with a "Void" tag, a "Reversal" row follows, and the closing balance equals the card balance

### Requirement: Statement PDF (print view)
A **PDF** button SHALL open `/[lang]/owners/[id]/statement/print?from=&to=` — a print-styled page (no app chrome) with house name, owner name, share %, period, generated date and by whom, the full table Brought forward → Closing, totals per entry type and the legend — that opens the browser's print dialog for "Save as PDF", with the document title `BariHisab-Statement-{OwnerName}-{From}-{To}` so the saved file is named accordingly. It MUST render in the viewer's language with Bangla digits in বাংলা, and its figures MUST match the on-screen statement for the same range. Each printed page shows "Generated by BariHisab · page X of Y" where the browser supports page counters. (F4, Acceptance "PDF matches the screen")

#### Scenario: Print view matches screen
- **WHEN** an Owner opens the print view for Aug 2026 → Latest
- **THEN** brought forward, every row and the closing balance equal the on-screen statement and the title is `BariHisab-Statement-Nasrin Ahmed-2026-08-Latest`

### Requirement: Change shares dialog
**Change shares** SHALL open a dialog with the body "A new version starts on the 1st of the chosen month. Closed months keep the shares they were closed with.", one row per current owner (name, whole-units input pre-filled from today's set, live % with 1 decimal), **+ Add an owner to this share set** (new or former owners), a total line "{n} units = 100%", **Effective from** (open months and the next month only), **Reason (required)** with hint "Inheritance deed dated…", and **Cancel** / **Save share set**. Saving MUST first show a confirmation listing before → after for every changed owner and "Closed months keep their old shares. {Month} and later will use the new ones."; setting an owner to 0 is called out there as making them a former owner. Validation messages: "A reason is required for every share change.", "Total share units must be above zero.". Success toast "Share set saved · effective {Month}". (F6, §8)

#### Scenario: Confirm before → after
- **WHEN** a Super Admin changes Nasrin 50 → 40, adds Sabrina 0 → 10, picks June 2026, enters a reason and saves
- **THEN** a confirmation lists "Nasrin Ahmed 50 → 40" and "Sabrina Ahmed 0 → 10", and confirming shows the toast "Share set saved · effective June 2026"

### Requirement: Add and edit owner forms
**Add owner** SHALL offer **Link a user** (users not yet owners) or **Name only (no login)**, with display name (pre-filled from the user), initials and display order; after saving it offers **Give shares now**, which opens Change shares. **Edit owner** SHALL edit display name, initials, display order, note and link/unlink a login. There is no delete control. **Opening balance** SHALL take an amount with an Owed (+) / Advance outstanding (−) choice and a note. (F7, F8, F10)

#### Scenario: Name-only owner
- **WHEN** a Super Admin adds "Estate of Karim Ahmed" as name only
- **THEN** a new card appears with a "No login" tag and "0 units", and **Give shares now** is offered

### Requirement: Pay and advance drawer
**Pay** SHALL open a side drawer with a balance panel "{Name} · balance ৳X (owed)", "Against: {oldest due month}" and **Use full balance ৳X**, then Amount, Date (default today), Fund account (with balance), Method segmented control (Cash / Bank / bKash / Nagad), Reference no. ("bKash TrxID or cheque no.", required except Cash), Note and receipt attachment. When the balance is ≤ 0 the amount starts empty and the drawer warns "Nothing is owed — anything you pay becomes an advance or loan". Non-blocking warnings appear for amount above the fund account or House Fund balance ("This is more than the House Fund holds (৳X)."). When the server answers `EXCEEDS_BALANCE`, a "More than the balance" dialog shows Payout ৳X / Excess ৳Y with **Record excess as an advance**, **Record excess as a loan**, **Change the amount**. **Record advance** uses the same drawer with a required reason ("visible to all owners") and shows "Above the advance limit — allowed, but flagged." when flagged. Success toast "Payment of ৳X recorded for {Name}"; the detail, list figures and fund balances refresh without a full reload. Double submit MUST be prevented (one Idempotency-Key per open drawer). (F11, F12, G8, §8)

#### Scenario: Pay more than owed
- **WHEN** a Super Admin enters ৳13,000 for Tanvir (owed ৳8,055.85) and saves
- **THEN** the dialog shows "Payout ৳8,055.85" and "Excess ৳4,944.15"; choosing "Record excess as an advance" adds a Payout and an Advance row and the balance shows "Advance outstanding ৳4,944.15"

### Requirement: Void and adjustment dialogs
**Void** SHALL open a confirmation dialog "Void this payout? A reversal of ৳X is posted in {open month}. The balance and the House Fund return to where they were; the original stays visible with a Void mark." with a required reason ("Please write a reason — everyone can see it.") and **Post reversal**; success toast "Reversal posted · balance and fund restored". **Balance adjustment** SHALL open a dialog with amount, Owed (+) / Reduce (−) choice, reference month and required reason. Both follow the destructive-action confirmation rules (no double submit, visible failure, focus return). (F13, F14, §8)

#### Scenario: Void a payout
- **WHEN** a Super Admin voids a ৳5,000 payout with reason "Recorded for the wrong owner"
- **THEN** the row shows "Void", a Reversal row appears and the toast "Reversal posted · balance and fund restored" is shown

### Requirement: Bilingual, accessible and mobile ready
Every Owners screen, dialog and message SHALL exist in English and বাংলা, use Bangla digits and lakh grouping for money in বাংলা, pair every colour with a word, use real links/buttons/labels, keep 44px touch targets, use only design-system tokens (zero radius, one yellow fill), and work at 360px width without horizontal page scroll (tables scroll inside their wrapper). (Rules 21–22, Acceptance "360px, বাংলা and English")

#### Scenario: Bangla at 360px
- **WHEN** the list and detail are opened in বাংলা at 360px width
- **THEN** all labels are Bangla, amounts use Bangla digits, and the page body does not scroll horizontally

### Requirement: Loan instalment in the owner screens
When a payout excess is recorded as a loan, the excess dialog SHALL offer an optional "Monthly instalment" amount. The owner detail SHALL list the owner's ACTIVE loans with outstanding and instalment ("No instalment" when unset), and users with `loan.manage` SHALL be able to set or clear the instalment from there. (Distribution PRD F11; ADV-02)

#### Scenario: Instalment while splitting
- **WHEN** a Super Admin pays Tanvir beyond his balance, chooses Loan and enters a ৳1,000 instalment
- **THEN** the created loan shows "Instalment ৳1,000" on Tanvir's detail

#### Scenario: Owner cannot edit
- **WHEN** an Owner views their detail with an active loan
- **THEN** the loan and its instalment are shown with no edit control
