# BariHisab — Advances & Loans Section PRD

> Version 1.0 · Nov 9, 2026 · Author: Rayhan (dev4@awfatech.com)
> Section: Advances & Loans (loan ledger, loan repayments, automatic instalments, advance history, advance limit)
> Depends on: Authentication & roles, Owners (balances, payments), Distribution (month close), Settings, Requests (Phase 2)

This document covers **features and behaviour only**. Technical design (database, API, code structure) is left to the implementation.

## Table of Contents

1. [Overview](#1-overview)
2. [Design Analysis](#2-design-analysis)
3. [Key Concepts](#3-key-concepts)
4. [Who Can Do What](#4-who-can-do-what)
5. [Features](#5-features)
6. [User Flows](#6-user-flows)
7. [Calculation Rules](#7-calculation-rules)
8. [Business Rules](#8-business-rules)
9. [Messages, Warnings & Empty States](#9-messages-warnings--empty-states)
10. [Notifications](#10-notifications)
11. [Worked Examples](#11-worked-examples)
12. [Acceptance Criteria](#12-acceptance-criteria)
13. [Release Phases](#13-release-phases)
14. [Open Questions](#14-open-questions)

---

## 1. Overview

Sometimes an owner needs money before their share is due. BariHisab offers two ways, and this section keeps both visible to every owner:

- **Advance** — money paid ahead of the owner's future entitlements. Their balance goes negative and is filled automatically by the next months' shares. No repayment plan.
- **Loan** — a separate debt to the house with its own ledger. It doesn't touch the owner's balance; it is repaid in cash or by deductions from entitlements, optionally a fixed amount every month.

### Goals

- Every owner can see who has taken how much, why, and how much is still due.
- Loans are repaid on a clear schedule, and the remaining amount is always correct to the paisa.
- Advances never need manual "settling" — the next entitlements recover them.
- The bookkeeper can record, repay and correct loans and advances openly, with reasons everyone can read.

### In scope

- Summary of loans outstanding, active loans and advances paid
- Loan list and loan detail with full movement history
- New loan (direct by Super Admin)
- Loan repayment in cash or by deduction from entitlement
- Automatic monthly instalments (taken at month close)
- Change instalment, void a repayment, cancel a loan, write off (P2)
- Advance history and recording an advance
- Advance limit and per-owner advance standing
- Filters, loan statement PDF (P2)
- Links to Requests (P2)

### Out of scope

- Owner requests and approvals (Requests section — this section shows where a loan/advance came from)
- Special grants (non-refundable; recorded as a house expense through Requests)
- Owner payments (Owners section) — except when an overpayment is turned into an advance or loan
- Month close mechanics (Distribution section — this section shows the instalments it takes)

### Success metrics

| Metric | Target |
| --- | --- |
| Loan outstanding shown = disbursed − repaid − deductions | 100% of the time |
| Advances and loans recorded with a reason | 100% |
| Loans with an instalment that finish on the expected month | ≥ 90% |
| Owner questions "how much do I still owe?" not answered by the page | 0 |
| Time to record a repayment | < 30 seconds |

---

## 2. Design Analysis

What the BariHisab design already shows for Advances & Loans, and what it leaves open.

### 2.1 What the design shows

**Header**

- Kicker "Separate loan ledger", title "Advances & loans".
- Super Admin actions: **+ Advance** (secondary) and **+ New loan** (primary).

**Summary tiles**

| Tile | Meaning |
| --- | --- |
| Loans outstanding | Total still owed on all loans |
| Active loans | Number of loans not yet repaid |
| Advances paid (all time) | Total of all advances ever paid |

**Loans list** — one card per loan

- "{Loan no.} · {Owner}" with an **Active** tag (yellow) or plain "Repaid".
- Reason ("Daughter's school admission").
- "Disbursed {date} · instalment ৳5,000 / month" or "Manual".
- "Repaid ৳X of ৳Y" and "৳Z left", with a progress bar.
- Movement list: "{date} · Disbursed / Repaid in cash / Deducted from entitlement / Reversal · ৳X".
- **Record repayment** (Super Admin, active loans).

**Record repayment dialog**

- Title "Record repayment · {Loan no.}", sub-line "{Owner} · outstanding ৳X".
- Mode: **Cash into the fund** / **Deduct from entitlement**, with a line explaining each:
  - Cash: "Cash comes back into the House Fund. The owner's entitlement balance is untouched."
  - Deduction: "Creates a loan deduction on the owner ledger. Cash stays in the House Fund."
- Amount (default = instalment or full outstanding), Date, **Into fund account** (cash only).
- **Cancel** / **Record repayment**.

**Advance history**

- One row per advance: date, owner, note ("Advance · eye check-up"), amount, "balance now ৳X" coloured by sign.
- Footer: "Advance limit: 1× each owner's average entitlement over the last 3 closed months. Going above it shows a warning, not a block."

**New loan / Advance drawer** (shared entry drawer)

- Owner, amount, date, fund account (with balance), method (Cash / Bank / bKash / Nagad), reference no.
- Loan: "Monthly instalment (৳, optional — deducted on each close)".
- Both: "Reason (required · visible to all owners)".
- Advance over the limit: "Above the advance limit — allowed, but flagged."

**Related places**

- Owners page: Loan column / tile; **Record advance** button on an owner's page.
- Payment drawer: paying more than owed → "Record excess as an advance" / "Record excess as a loan".
- Distribution: "Loan instalment ৳5,000 deducted from Tanvir Ahmed" in the close summary; Loan ded. column.
- Requests: approved advances and loans become entries here (Phase 2).

### 2.2 Sample data in the design

| Loan | Owner | Amount | Disbursed | Instalment | Repaid | Left | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| L1 | Farzana Haque — "Laptop for work" | ৳20,000 | 12 Feb 2026 | Manual | ৳20,000 (cash ৳10,000 on 30 Mar + ৳10,000 on 28 May) | ৳0 | Repaid |
| L2 | Tanvir Ahmed — "Daughter's school admission" | ৳50,000 | 10 Jun 2026 | ৳5,000 / month | ৳15,000 (deducted Jul, Aug, Sep) | ৳35,000 | Active |

Advances: Nasrin Ahmed ৳5,000 on 12 Oct 2026 ("eye check-up"); her balance is now −৳5,000.
Requests linked to this section: Nasrin's pending ৳10,000 advance (cataract surgery), Tanvir's ৳8,000 advance approved at ৳6,000, Tanvir's ৳20,000 loan rejected ("Existing loan L2 still outstanding").

### 2.3 Gaps found and decisions

| # | Gap in the design | Decision |
| --- | --- | --- |
| G1 | A repayment bigger than the outstanding is silently cut down | Refuse it with "Only ৳X is outstanding" and offer **Use full outstanding** |
| G2 | "Deduct from entitlement" can push the owner's balance below zero | Deduction allowed only up to the owner's positive balance; otherwise suggest cash |
| G3 | The instalment can't be changed after the loan is created | Add **Change instalment** (amount or Manual) with a reason |
| G4 | No way to undo a wrong repayment or a wrong loan | Add **Void repayment** (reversal) and **Cancel loan** (only with no repayments); reason required |
| G5 | "Advances paid (all time)" counts voided advances too | Exclude voided advances |
| G6 | An advance's recovery isn't visible | Each advance shows **Outstanding** until the owner's balance is back to ৳0 or above, then **Recovered in {month}** |
| G7 | No filters | Filter by owner and status (Active / Repaid / Written off / Cancelled); advances by owner and year |
| G8 | No write-off (main PRD has a Written-off status) | Add **Write off** (P2) with reason; every owner notified |
| G9 | No warning when an owner already has an active loan | Warning on New loan: "Tanvir already has L2 with ৳35,000 left." |
| G10 | No payoff estimate | Show **Expected to finish {month}** for loans with an instalment |
| G11 | Recording an advance for an owner who is still owed money | Warning: "Nasrin is owed ৳X — pay that first; an advance is for money beyond what is owed." |
| G12 | Super Admin can lend or advance to themself with no special mark | Tag **Self** and notify every owner (P2 email) |
| G13 | Loans and advances don't say where they came from | Show source: Direct, From request #…, From payment (excess over balance) |
| G14 | No per-owner view | Add **By owner** tab: each owner's loan outstanding, advance outstanding, advance limit |
| G15 | No warning when the House Fund can't cover a new loan or advance | Warning (not block) when the amount is more than the fund account or whole House Fund holds |

---

## 3. Key Concepts

### Advance
Money paid to an owner **beyond what they are owed**. It is recorded on the owner's balance, which becomes negative ("Advance outstanding"). There is no repayment plan: when the next months close, the owner's entitlements fill the negative balance first. An advance is "recovered" when the owner's balance is back to ৳0 or above.

### Loan
A separate debt to the house, with its own number (L1, L2, …), amount, date, reason and optional monthly instalment. A loan does **not** change the owner's balance when it is paid out. It is repaid by:
- **Cash** — the owner pays money back into the House Fund, or
- **Deduction** — part of the owner's entitlement is used to repay; no cash moves.

### Loan outstanding
Amount disbursed − cash repaid − deductions (+ any reversals). At ৳0 the loan becomes **Repaid**. No interest in v1.

### Instalment
An optional fixed amount taken from the owner's entitlement every time a month closes. "Manual" means no automatic deduction.

### Advance limit
A soft cap on advances, set in Settings as a multiple (default 1×) of the owner's average entitlement over the last 3 closed months. Going over it shows a warning but is allowed.

### Advance vs Loan — when to use which

| | Advance | Loan |
| --- | --- | --- |
| Typical size | Up to about one month's share | Larger than a month's share |
| Affects owner balance | Yes, goes negative | No |
| Repayment | Automatic from next entitlements | Cash or deductions, optional instalment |
| Ledger | Owner's statement | Separate loan ledger |
| Shown in | Advance history, owner statement | Loans list, owner's Loan figure |

---

## 4. Who Can Do What

| Feature | Super Admin | Owner |
| --- | --- | --- |
| See summary, all loans, all movements, advance history | ✓ | ✓ |
| See any loan's detail and source | ✓ | ✓ |
| Download loan statement PDF (P2) | ✓ | ✓ |
| Create a loan | ✓ (for self: tagged Self) | ✗ (asks through Requests) |
| Record an advance | ✓ (for self: tagged Self) | ✗ (asks through Requests) |
| Record a repayment (cash or deduction) | ✓ | ✗ |
| Change instalment | ✓ | ✗ |
| Void a repayment / cancel a loan | ✓ | ✗ |
| Write off a loan (P2) | ✓ | ✗ |
| Void an advance | ✓ (from the owner's statement) | ✗ |

The server checks every action again, whatever the screen shows.

---

## 5. Features

### F1 · Header and summary — P1

- Kicker "Separate loan ledger", title "Advances & loans".
- Super Admin buttons: **+ Advance**, **+ New loan**.
- Tiles: **Loans outstanding**, **Active loans**, **Advances outstanding** (sum of owners' negative balances), **Advances paid this year** (voided excluded), with a year switcher for the last tile.
- Tabs: **Loans** · **Advances** · **By owner**.

### F2 · Loans list — P1

- One card per loan, newest first; filters: owner, status (Active, Repaid, Written off, Cancelled).
- Card: "{Loan no.} · {Owner}", status tag (**Active** yellow; Repaid, Written off, Cancelled neutral), **Self** tag when the Super Admin borrowed from the house.
- Reason, "Disbursed {date}", instalment ("৳5,000 / month" or "Manual"), source ("Direct", "From request #…", "From payment — excess over balance").
- "Repaid ৳X of ৳Y" · "৳Z left" · progress bar.
- "Expected to finish {month}" for loans with an instalment.
- Last 3 movements, with **See all** opening the detail.
- Super Admin (active loans): **Record repayment** and a **⋯** menu (Change instalment, Cancel loan, Write off).
- On phones the card stacks: header, amounts, progress bar, button.

### F3 · Loan detail — P1

- Opens from a card.
- Header: loan no., owner, status, reason, source link, disbursed date, fund account, method and reference no.
- Figures: amount, repaid in cash, repaid by deduction, outstanding, instalment, expected finish month.
- **Movement history**, oldest first: date · type (Disbursed, Repaid in cash, Deducted from entitlement, Reversal, Written off) · amount · running outstanding · recorded by · note.
- Voided movements stay visible, struck through, with their reversal.
- **Change history**: instalment changes and status changes with reason and who made them.
- Super Admin actions as in F2.

### F4 · New loan — P1 (Super Admin)

- Fields: owner, amount, date (default today), fund account (shows balance), method (Cash / Bank / bKash / Nagad), reference no. (required except Cash), monthly instalment (optional), **reason (required, visible to all owners)**.
- Live hints:
  - "Tanvir already has L2 with ৳35,000 left." if the owner has an active loan.
  - "Paid back in about {n} months — finishing {month}." when an instalment is set.
  - "Instalment is more than Tanvir's average monthly share (৳12,435.95)." when it is.
  - Fund warning when the amount is more than the fund account or the House Fund holds.
- Saves as the next loan number; House Fund goes down; owner's balance doesn't change.
- Toast "Loan L3 recorded · ৳X to {Owner}".

### F5 · Record repayment — P1 (Super Admin)

- From **Record repayment** on an active loan.
- Header "Record repayment · {Loan no.}", "{Owner} · outstanding ৳X".
- Mode:
  - **Cash into the fund** — fields: amount, date, fund account, method, reference no.
  - **Deduct from entitlement** — fields: amount, date. Shows "{Owner}'s balance: ৳X owed. Deduction can be up to ৳Y."
- Amount default: the instalment if set, otherwise the full outstanding; **Use full outstanding** button.
- Refuses amounts above the outstanding (G1) and deductions above the owner's positive balance (G2).
- Posted in the latest open month (needs an open month).
- When outstanding reaches ৳0 → status **Repaid**, toast "L2 is fully repaid."

### F6 · Automatic instalments — P1

- Taken by the Distribution section when a month closes (rule in 7.3).
- This section shows:
  - On each active loan with an instalment: "Next deduction ৳5,000 when {open month} closes."
  - In the movement history: "Deducted from entitlement" rows dated the month's last day.
  - When skipped (no entitlement that month): a note row "Instalment skipped — no entitlement in {month}."
- Reopening a month reverses its deduction (shown as **Reversal**); a loan that had become Repaid goes back to Active.

### F7 · Change instalment — P1 (Super Admin)

- From **⋯ › Change instalment**.
- New amount or **Manual (no automatic deduction)**; starts from the next month close.
- Reason required (e.g. "Reduced until March at owner's request").
- Shows the new expected finish month before saving.
- Recorded in the loan's change history and the Audit log.

### F8 · Void a repayment — P1 (Super Admin)

- **Void** on a cash repayment or manual deduction in the loan's movement history (needs an open month).
- Reason required, visible to everyone.
- Posts a **Reversal**: outstanding goes back up; for cash, the House Fund goes down; for a deduction, the owner's balance goes back up.
- Automatic instalments taken at close can't be voided here — they change only by reopening that month in Distribution.

### F9 · Cancel a loan — P1 (Super Admin)

- Only for a loan with **no repayments** (e.g. recorded for the wrong owner or never actually paid out).
- Reason required; the disbursement is reversed (House Fund back up); status **Cancelled**; the loan stays visible.

### F10 · Write off — P2 (Super Admin)

- For a loan the family agrees won't be repaid (hardship, death).
- Shows outstanding and asks for a reason.
- Status **Written off**; outstanding becomes ৳0 for the loan, and the written-off amount is recorded as a house expense in the open month (category "Loan written off"), so it is shared by all owners.
- Every owner is notified.

### F11 · Advance history — P1

- **Advances** tab: one row per advance, newest first; filters: owner, year.
- Row: date, owner, note/reason, amount, source (Direct, From request #…, From payment — excess), status:
  - **Outstanding** — the owner's balance is still negative
  - **Recovered in {month}** — the month the owner's balance got back to ৳0 or above
  - **Void** — struck through, with reason
- "Balance now ৳X" for the owner, coloured by sign.
- Tap a row → the owner's statement at that month.
- Footer: the advance limit rule in plain words.

### F12 · Record an advance — P1 (Super Admin)

- From **+ Advance** here or **Record advance** on an owner's page.
- Fields: owner, amount, date, fund account, method, reference no., **reason (required, visible to all owners)**.
- Live panel for the chosen owner: current balance, advance limit, how much of the limit is used.
- Warnings (never block):
  - Over the limit: "Above the advance limit — allowed, but flagged."
  - Owner is owed money: "{Name} is owed ৳X — pay that first; an advance is for money beyond what is owed."
  - Fund: amount more than the fund account or House Fund holds.
- Saves to the owner's statement as **Advance**; the advance appears in history as Outstanding.
- Voiding an advance is done from the owner's statement (Owners section).

### F13 · By owner — P1

- One row per owner: loan outstanding (and number of active loans), advance outstanding (negative balance), advance limit, % of limit used, last advance date.
- Tap → that owner's page.
- Helps the bookkeeper decide on new requests.

### F14 · Advance limit — P1

- Rule set in Settings (0.5×, 1×, 1.5×, 2× of the last 3 closed months' average entitlement; default 1×).
- Shown on the Advances tab footer, on each owner in **By owner**, and in the advance form.
- With fewer than 3 closed months, uses the average of the closed months available; with none, no limit is shown and the form says "No limit yet — no closed months."

### F15 · Loan statement PDF — P2

- From a loan's detail: house, owner, loan no., reason, amount, instalment, full movement history with running outstanding, current status, generated date.
- In the viewer's language.

### F16 · Requests link — P2

- Approved and disbursed requests create the advance or loan here automatically, with "From request #…" linking back.
- A loan request can propose a repayment plan; the Super Admin sets the final instalment on disbursement.
- The pending request count shows as a badge link "2 requests waiting" in the header (Super Admin).

---

## 6. User Flows

### 6.1 Giving a loan (Super Admin)

1. Tanvir needs ৳50,000 for school admission — more than a month's share, so a loan.
2. **+ New loan** → owner Tanvir, ৳50,000, bank transfer, reference no., instalment ৳5,000, reason "Daughter's school admission".
3. Hint: "First deduction when July closes · paid back in 10 months — finishing April 2027."
4. Save → L2 Active; House Fund −৳50,000; Tanvir's balance unchanged.

### 6.2 Monthly instalment

1. October closes in Distribution → ৳5,000 deducted from Tanvir's October entitlement.
2. L2 shows "Deducted from entitlement ৳5,000", "Repaid ৳20,000 of ৳50,000 · ৳30,000 left".
3. Tanvir's statement shows **Loan deduction −৳5,000**.

### 6.3 Cash repayment

1. Farzana returns ৳10,000 in cash for L1.
2. **Record repayment** → Cash into the fund → ৳10,000 → Cash account → save.
3. House Fund +৳10,000; L1 "৳10,000 left"; Farzana's balance unchanged.
4. Second ৳10,000 later → L1 **Repaid**.

### 6.4 Recording an advance

1. Nasrin needs ৳5,000 for an eye check-up; her balance is ৳0.
2. **+ Advance** → Nasrin, ৳5,000, reason "eye check-up". Panel shows her limit (about ৳33,162) — within limit.
3. Save → her balance −৳5,000; advance history shows **Outstanding**.
4. October closes → her ৳33,827.60 entitlement fills the −৳5,000 → advance shows **Recovered in October 2026**.

### 6.5 Owner lowers instalment

1. Tanvir asks to pay ৳3,000 instead of ৳5,000 until March.
2. The family agrees; Super Admin → **⋯ › Change instalment** → ৳3,000, reason "Reduced until March at owner's request".
3. New expected finish month shown; next close deducts ৳3,000.

### 6.6 Wrong repayment

1. A ৳10,000 cash repayment was put on the wrong loan.
2. Super Admin → loan detail → **Void** on that movement → reason → **Post reversal**.
3. Records it again on the right loan; both histories show what happened.

---

## 7. Calculation Rules

### 7.1 Loan outstanding

- Outstanding = amount disbursed − cash repayments − deductions + reversals of repayments.
- Repaid = cash repayments + deductions − their reversals.
- Progress % = Repaid ÷ amount disbursed.
- Status: Active while outstanding > ৳0; **Repaid** at ৳0; **Cancelled** / **Written off** set by the Super Admin.

### 7.2 Expected finish month

- Months left = outstanding ÷ instalment, rounded up.
- Instalments start with the close of the month **after** the loan was disbursed (a loan paid out in June is first deducted when July closes).
- Expected finish = the month whose close takes the last instalment.
- Shown only when an instalment is set; "Manual" loans show "No schedule".

### 7.3 Automatic instalment at month close

- Only loans disbursed before this month take an instalment (the first deduction is the month after disbursement).
- Deducted = the smallest of: the instalment, the loan outstanding, and the owner's entitlement for that month still free after earlier deductions.
- If an owner has two loans with instalments, the older loan is deducted first.
- If ৳0 can be deducted, the instalment is skipped and noted.

### 7.4 Deduction repayment (manual)

- Allowed up to the smaller of the loan outstanding and the owner's current positive balance.

### 7.5 Advance limit

- Limit = multiplier × average of the owner's entitlements in the last 3 closed months (fewer if fewer exist).
- Used % = advance outstanding (negative balance, as a positive number) + the new advance, ÷ limit.

### 7.6 Advance recovery

- An advance is **Outstanding** while the owner's balance is below ৳0.
- It is **Recovered** in the first month whose close brings the balance back to ৳0 or above.
- If an owner has several advances, they are recovered oldest first.

---

## 8. Business Rules

1. Every loan and advance needs a reason, visible to all owners.
2. Loans never change the owner's balance when paid out; advances always do.
3. A repayment can never be more than the loan outstanding.
4. A manual deduction can never push the owner's balance below ৳0.
5. Automatic instalments are taken only at month close, never more than that month's entitlement.
6. No interest or fees in v1.
7. Nothing is deleted. Mistakes are fixed by Void (reversal), Cancel (no repayments only) or Write off (P2), each with a reason.
8. Loans, repayments and advances are posted in the latest open month; with no open month, they can't be recorded.
9. Loan numbers are sequential per house and never reused (L1, L2, L3…).
10. Advances above the limit and new loans for owners who already have one are allowed, but flagged.
11. A loan or advance for the Super Admin is tagged **Self** and every owner is told.
12. Reopening a closed month reverses that month's automatic deductions; a Repaid loan can return to Active.
13. Bank, bKash and Nagad disbursements and cash repayments by those methods need a reference number.
14. Money shows as ৳ with lakh grouping; Bangla digits in Bangla; paisa only when not zero.
15. Colour always comes with a word (Active, Repaid, Outstanding, Recovered).

---

## 9. Messages, Warnings & Empty States

| Situation | Message |
| --- | --- |
| No amount | "Enter an amount greater than zero." |
| No reason | "A reason is required — every owner can see it." |
| Repayment above outstanding | "Only ৳X is outstanding on {Loan no.}." + **Use full outstanding** |
| Deduction above balance | "{Name}'s balance is ৳X — you can deduct up to that. Use cash for the rest." |
| No open month | "Open a month first — loans and repayments are recorded in an open month." |
| Owner already has a loan | ⚠ "{Name} already has {Loan no.} with ৳X left." |
| Instalment larger than usual share | ⚠ "Instalment is more than {Name}'s average monthly share (৳X)." |
| Over advance limit | ⚠ "Above the advance limit — allowed, but flagged." |
| Owner is owed money | ⚠ "{Name} is owed ৳X — pay that first; an advance is for money beyond what is owed." |
| Fund too low | ⚠ "This is more than {fund account} holds (৳X)." / "…more than the House Fund holds (৳X)." |
| Cancel loan with repayments | "This loan has repayments, so it can't be cancelled. Void the repayments first or write it off." |
| Loan recorded | "Loan {no.} recorded · ৳X to {Name}" |
| Repayment recorded | "Repayment recorded · ৳X left on {no.}" |
| Fully repaid | "{Loan no.} is fully repaid." |
| Instalment skipped | "Instalment skipped — no entitlement in {Month}." |
| No loans yet | "No loans yet. Loans are for amounts bigger than a month's share." + **New loan** (Super Admin) |
| No advances yet | "No advances yet." |
| No limit yet | "No limit yet — no closed months." |

---

## 10. Notifications

| Event | Who is told | Phase |
| --- | --- | --- |
| New loan or advance disbursed | All owners (who, how much, type, reason, who approved) | P2 |
| Loan or advance for the Super Admin (Self) | All owners | P2 |
| Repayment recorded | The borrowing owner (amount, left, expected finish) | P2 |
| Loan fully repaid | The borrowing owner | P2 |
| Instalment changed | The borrowing owner | P2 |
| Instalment skipped | The borrowing owner (inside the monthly report) | P2 |
| Repayment voided / loan cancelled | The borrowing owner | P2 |
| Loan written off | All owners | P2 |
| Advance over the limit | Super Admin (shown on dashboard) | P2 |

Emails never include bank account numbers or other owners' contact details.

---

## 11. Worked Examples

All figures from the design's sample data.

### 11.1 Loan L2 — Tanvir Ahmed

| Date | Movement | Amount | Outstanding |
| --- | --- | --- | --- |
| 10 Jun 2026 | Disbursed (bank) | ৳50,000 | ৳50,000 |
| 31 Jul 2026 | Deducted from entitlement | ৳5,000 | ৳45,000 |
| 31 Aug 2026 | Deducted from entitlement | ৳5,000 | ৳40,000 |
| 30 Sep 2026 | Deducted from entitlement | ৳5,000 | ৳35,000 |
| 31 Oct 2026 (on close) | Deducted from entitlement | ৳5,000 | ৳30,000 |

Repaid ৳20,000 of ৳50,000 (40%) after October. Six more instalments (November–April) → expected to finish **April 2027**.

### 11.2 Loan L1 — Farzana Haque (manual)

| Date | Movement | Amount | Outstanding |
| --- | --- | --- | --- |
| 12 Feb 2026 | Disbursed (bank) | ৳20,000 | ৳20,000 |
| 30 Mar 2026 | Repaid in cash | ৳10,000 | ৳10,000 |
| 28 May 2026 | Repaid in cash | ৳10,000 | ৳0 → **Repaid** |

### 11.3 Advance — Nasrin Ahmed

- Advance limit (1×): average of Jul ৳29,894.40, Aug ৳34,777.60, Sep ৳34,815.60 = **৳33,162.53**.
- 12 Oct: advance ৳5,000 → balance −৳5,000 (15% of limit used) → **Outstanding**.
- October close: entitlement ৳33,827.60 → balance ৳28,827.60 → advance **Recovered in October 2026**.

### 11.4 Advance vs loan check for a request

Tanvir asks for ৳8,000 as an advance. His limit is about ৳12,436 (average of ৳11,210.40, ৳13,041.60, ৳13,055.85) and he also has L2 with ৳35,000 left → the form shows both facts; the design's request was approved at ৳6,000.

---

## 12. Acceptance Criteria

### Loans
- [ ] New loan needs owner, amount and reason; it lowers the House Fund but not the owner's balance
- [ ] Loan numbers are sequential and never reused
- [ ] Outstanding always equals disbursed − repayments + reversals
- [ ] Cash repayment raises the House Fund; deduction lowers the owner's balance and leaves the House Fund unchanged
- [ ] Repayments above the outstanding and deductions above the owner's balance are refused
- [ ] Reaching ৳0 sets Repaid; reopening the month that repaid it sets Active again
- [ ] Automatic instalments never exceed the month's entitlement or the outstanding; skipped ones are noted
- [ ] Change instalment updates the expected finish month and is recorded with a reason
- [ ] Voiding a repayment posts a reversal and restores outstanding, fund and balance exactly
- [ ] A loan with repayments can't be cancelled

### Advances
- [ ] Advances need a reason and make the owner's balance negative
- [ ] Over-limit advances are allowed and flagged
- [ ] Advance status changes from Outstanding to Recovered in the right month
- [ ] Voided advances are excluded from totals but stay visible

### General
- [ ] Owners see every loan, movement and advance but no create/repay/change/void buttons, and are refused if they try
- [ ] Every action is in the Audit Log with who, when and reason
- [ ] Self loans/advances are tagged
- [ ] All screens work at 360px width, in বাংলা and English

---

## 13. Release Phases

| Phase | Features |
| --- | --- |
| **P1 — MVP** | F1 Header & summary · F2 Loans list · F3 Loan detail · F4 New loan · F5 Record repayment · F6 Automatic instalments · F7 Change instalment · F8 Void repayment · F9 Cancel loan · F11 Advance history · F12 Record advance · F13 By owner · F14 Advance limit |
| **P2** | F10 Write off · F15 Loan statement PDF · F16 Requests link · all notifications in section 10 |
| **P3** | Owner-proposed repayment plans with family vote · optional interest or fee · reminder to owners with cash repayments due |

---

## 14. Open Questions

- [ ] Should a new loan be blocked (not just warned) when the owner already has an active loan?
- [ ] Should a written-off loan be shared by all owners as an expense (this PRD), or charged only to the borrower's future entitlements?
- [ ] Is the advance limit the same for every owner, or can it be set per owner?
- [ ] When an instalment is skipped, should the next month take a double instalment?
- [ ] Should loans for the Super Admin need another owner's approval?
- [ ] Should there ever be a maximum loan amount (e.g. a % of the House Fund)?
- [ ] Should owners be able to prepay a loan by asking for a bigger deduction from their own entitlement?