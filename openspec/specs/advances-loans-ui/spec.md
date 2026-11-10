# advances-loans-ui Specification

## Purpose

The Advances & loans screen where every owner sees all loans, repayments and advances, and the Super Admin records, repays and corrects them through drawers and dialogs that follow the BariHisab design system. (Advances & Loans PRD F1–F15; main PRD S7)

## Requirements

### Requirement: Navigation
The app shell SHALL show "Advances & loans" (বাংলায় "অগ্রিম ও ঋণ") linking to `/[lang]/advances` for users with `loan.view`, in the sidebar and the phone bottom bar, marked current on that route. Users without `loan.view` MUST see the Forbidden view on the route. (S7)

#### Scenario: Owner sees the entry
- **WHEN** an Owner opens the app
- **THEN** the navigation contains "Advances & loans" and the page opens

### Requirement: Header, summary and tabs
The screen SHALL show the kicker "Separate loan ledger", title "Advances & loans", for users with `advance.create` a secondary **+ Advance** and for users with `loan.create` a primary **+ New loan**, four tiles — Loans outstanding, Active loans, Advances outstanding, Advances paid {year} (with a year switcher limited to years that have advances) — and tabs **Loans · Advances · By owner** whose selection, owner filter, status filter and year are kept in the URL. (F1)

#### Scenario: Tiles
- **WHEN** L2 has ৳35,000 left, it is the only active loan, Nasrin's balance is −৳5,000 and 2026 advances total ৳5,000
- **THEN** the tiles read "৳35,000", "1", "৳5,000" and "৳5,000"

### Requirement: Loans tab
The Loans tab SHALL show owner and status filters (All, Active, Repaid, Written off, Cancelled) and one card per loan, newest first: "L{n} · {Owner}", a status tag (Active on the one yellow signal fill; Repaid, Written off, Cancelled neutral, always as words), a **Self** tag, the reason, "Disbursed {date}", the instalment ("৳5,000 / month" or "Manual"), the source ("Direct" or "From payment — excess over balance"), "Repaid ৳X of ৳Y" · "৳Z left" with a progress bar, "Expected to finish {month}" and "Next deduction ৳X when {month} closes" when it has an instalment, the last 3 movements and **See all**. For ACTIVE loans users with `loan.repay` SHALL see **Record repayment** and users with `loan.manage` a **⋯** menu with Change instalment, Cancel loan and Write off. With no loans the tab shows "No loans yet. Loans are for amounts bigger than a month's share." plus **New loan** for users with `loan.create`. (F2, F6, §9)

#### Scenario: Active loan card
- **WHEN** the tab shows L2 (৳50,000, ৳15,000 repaid, instalment ৳5,000, October open)
- **THEN** the card reads "Repaid ৳15,000 of ৳50,000", "৳35,000 left", "Expected to finish April 2027" and "Next deduction ৳5,000 when October 2026 closes"

#### Scenario: Owner sees no actions
- **WHEN** an Owner views the Loans tab
- **THEN** no Record repayment button or ⋯ menu is shown

### Requirement: Loan detail sheet
**See all** or tapping a card SHALL open a detail sheet (deep-linkable with `?loan={id}`) with loan number, owner, status, reason, source, disbursed date, fund account, method and reference no.; figures for amount, repaid in cash, repaid by deduction, outstanding, instalment and expected finish (or "No schedule"); the movement history oldest first as date · type · amount · running outstanding · recorded by · note, with voided rows struck through and labelled "Void · {reason}" next to their Reversal, and "Instalment skipped — no entitlement in {Month}." rows; the change history with reason and who; **Void** on voidable movements for users with `loan.manage`; the same actions as the card; and **Print statement**. (F3, F8)

#### Scenario: Struck-through void
- **WHEN** a cash repayment of ৳10,000 was voided with reason "Recorded on the wrong loan"
- **THEN** the sheet shows that row struck through with "Void · Recorded on the wrong loan" and a "Reversal ৳10,000" row

### Requirement: New loan drawer
**+ New loan** SHALL open the shared entry drawer with Owner, Amount, Date (default today), Fund account (with balance), Method (Cash / Bank / bKash / Nagad), Reference no. (required except Cash), "Monthly instalment (৳, optional — deducted on each close)" and "Reason (required · visible to all owners)". Live hints SHALL show "{Name} already has L{n} with ৳X left.", "Paid back in about {n} months — finishing {month}." when an instalment is set, "Instalment is more than {Name}'s average monthly share (৳X)." and the fund warnings ("This is more than {fund account} holds (৳X)." / "…more than the House Fund holds (৳X)."). Empty amount shows "Enter an amount greater than zero."; empty reason "A reason is required — every owner can see it.". Success toast "Loan L{n} recorded · ৳X to {Name}". One Idempotency-Key per open drawer. (F4, §9)

#### Scenario: Hints
- **WHEN** a Super Admin picks Tanvir (L2 ৳35,000 left), enters ৳50,000 with instalment ৳5,000 in June
- **THEN** the drawer shows "Tanvir Ahmed already has L2 with ৳35,000 left." and "Paid back in about 10 months — finishing April 2027."

### Requirement: Advance drawer
**+ Advance** SHALL open the shared entry drawer with Owner, Amount, Date, Fund account, Method, Reference no. and the required reason, and for the chosen owner a live panel with current balance, advance limit (or "No limit yet — no closed months.") and the share of the limit used; warnings "Above the advance limit — allowed, but flagged.", "{Name} is owed ৳X — pay that first; an advance is for money beyond what is owed." and the fund warnings never block saving. Success toast "Advance of ৳X recorded for {Name}". (F12, F14)

#### Scenario: Owed warning
- **WHEN** the Super Admin picks an owner whose balance is ৳8,055.85
- **THEN** the drawer shows "Tanvir Ahmed is owed ৳8,055.85 — pay that first; an advance is for money beyond what is owed." and Save stays enabled

### Requirement: Record repayment dialog
**Record repayment** SHALL open "Record repayment · L{n}" with "{Owner} · outstanding ৳X", a mode choice **Cash into the fund** ("Cash comes back into the House Fund. The owner's entitlement balance is untouched.") / **Deduct from entitlement** ("Creates a loan deduction on the owner ledger. Cash stays in the House Fund."), Amount defaulting to the instalment if set or else the full outstanding, **Use full outstanding**, Date, and for cash Fund account, Method and Reference no.; for deduction "{Owner}'s balance: ৳X owed. Deduction can be up to ৳Y.". Server refusals show the PRD messages on the amount field. Success toast "Repayment recorded · ৳X left on L{n}" or "L{n} is fully repaid.". (F5, G1, G2, §9)

#### Scenario: Above the outstanding
- **WHEN** ৳12,000 is entered on a loan with ৳10,000 outstanding
- **THEN** the amount field shows "Only ৳10,000 is outstanding on L1." and **Use full outstanding** fills ৳10,000

### Requirement: Change instalment, void, cancel and write-off dialogs
Change instalment SHALL offer a new amount or "Manual (no automatic deduction)", show the new expected finish month before saving, and require a reason. Void, Cancel loan and Write off SHALL be confirmation dialogs (destructive-action rule) that require a reason visible to everyone; Cancel explains that the disbursement is reversed and the House Fund goes back up; Write off shows the outstanding and that it becomes a house expense shared by all owners. Server errors (`LOAN_HAS_REPAYMENTS`, `NOT_VOIDABLE`, `NO_OPEN_PERIOD`) show their messages in the dialog. (F7–F10)

#### Scenario: Cancel with repayments
- **WHEN** the Super Admin cancels a loan that has a repayment
- **THEN** the dialog shows "This loan has repayments, so it can't be cancelled. Void the repayments first or write it off."

### Requirement: Advances tab
The Advances tab SHALL show owner and year filters and one row per advance, newest first: date, owner, reason, amount, source ("Direct" / "From payment — excess"), a Self tag, a flag mark when over the limit, status ("Outstanding", "Recovered in {Month}", or struck-through "Void · {reason}") and "Balance now ৳X" coloured by sign with its word. Tapping a row SHALL open the owner's statement from that month. The footer SHALL state the rule in words, e.g. "Advance limit: 1× each owner's average entitlement over the last 3 closed months. Going above it shows a warning, not a block.". With none: "No advances yet.". (F11, F14)

#### Scenario: Recovered row
- **WHEN** Nasrin's ৳5,000 advance of 12 Oct 2026 was recovered by October's close
- **THEN** her row reads "Recovered in October 2026" and "Balance now ৳28,827.60"

### Requirement: By owner tab
The By owner tab SHALL list every owner with loan outstanding (and active-loan count), advance outstanding, advance limit (or "No limit yet"), % of limit used and last advance date; tapping a row opens that owner's page. (F13)

#### Scenario: Row
- **WHEN** Tanvir has L2 ৳35,000 left and advance outstanding ৳2,000 against a ৳12,435.95 limit
- **THEN** his row reads "৳35,000 · 1 loan", "৳2,000", "৳12,435.95" and "16%"

### Requirement: Advance limit in Settings
The Settings screen SHALL have an "Advance limit" section for users with `settings.manage`: a choice of 0.5×, 1×, 1.5×, 2× of the last 3 closed months' average entitlement and Save, with toast "Advance limit saved". (F14, SET-02)

#### Scenario: Save 2×
- **WHEN** the Super Admin picks 2× and saves
- **THEN** the Advances tab footer reads "Advance limit: 2× each owner's average entitlement over the last 3 closed months. …"

### Requirement: Loan statement print view
`/[lang]/loans/{id}/statement/print` (permission `loan.view`) SHALL render a print-ready page in the viewer's language with house name, owner, loan number, reason, amount, instalment, the full movement history with running outstanding, current status and generated date, and open the browser print dialog ("Save as PDF"). (F15, P2)

#### Scenario: Print L2
- **WHEN** an Owner opens L2's print view
- **THEN** the page lists every movement with running outstanding and the print dialog opens

### Requirement: Language, width and accessibility
Every Advances & loans screen, drawer and dialog SHALL work in বাংলা and English (Bangla digits in Bangla), show money as ৳ with lakh grouping and paisa only when not zero, pair every colour with a word, and fit 360 px width with no sideways scroll (loan cards stack header, amounts, progress bar, button; tables become card lists). (Rules 14, 15; §12 General)

#### Scenario: Bangla at 360px
- **WHEN** an Owner opens `/bn/advances` at 360 px width
- **THEN** the page has no horizontal scroll and amounts use Bangla digits
