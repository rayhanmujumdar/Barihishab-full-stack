# BariHisab — Distribution Section PRD

> Version 1.0 · Nov 9, 2026 · Author: Rayhan (dev4@awfatech.com)
> Section: Distribution (month staircase, owner distribution board, close month, reopen month, reserve, deficit, loan instalments on close)
> Depends on: Authentication & roles, Income & Expenses, Owners (shares, balances, payments), Advances & Loans, Settings

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

Distribution is where a month's house money becomes each owner's share. It shows **how much the house earned, what was spent and held back, what is left to share, and what each owner gets** — first as a live preview, then, when the bookkeeper closes the month, as permanent entitlements that can't change silently.

### Goals

- Every owner understands in one glance how the month's distributable amount was reached.
- Each owner's share is exact to the paisa and always adds up to the distributable amount.
- Closing a month is safe: a checklist before, a clear summary of what will happen, and a lock after.
- Mistakes in a closed month can be fixed openly (reopen with a reason, everyone told), never silently.

### In scope

- Month status header and month navigation
- Distributable "staircase": Income − Expense − Reserve − Previous deficit = Distributable
- Owner distribution board (preview for open months, final for closed months)
- Close month: checklist, impact summary, locking, entitlements, loan instalments
- Reopen the latest closed month and re-close with a before → after summary
- Reserve holdback (rule from Settings, per-month override, reserve balance)
- Deficit carried into the next month
- Paying owners from the board
- Month-close reminders

### Out of scope

- Entering income and expenses (Income & Expenses section)
- Owner statements, share changes, payment details (Owners section)
- Creating loans and loan repayments other than the automatic instalment (Advances & Loans)
- Monthly and yearly reports, PDF/Excel (Reports section — Distribution links to it)

### Success metrics

| Metric | Target |
| --- | --- |
| Sum of owner entitlements = distributable | 100% of months, to the paisa |
| Months closed within 5 days of month end | ≥ 80% |
| Close action completed from the board (checklist → confirm) | < 1 minute |
| Reopens per year | ≤ 2 |
| Owner questions "how was my share calculated?" not answered by the board | 0 |

---

## 2. Design Analysis

What the BariHisab design already shows for Distribution, and what it leaves open.

### 2.1 What the design shows

**Header**

| Element | Behaviour in the design |
| --- | --- |
| Kicker | Month label + **🔒 Closed** tag or **Draft — not closed yet** tag |
| Title | "Distribution" |
| Sub-line | Open: "Live preview — entitlements post when you close the month." · Closed: "Closed and locked · entitlements posted on close" (+ "· reopened N×") |
| Actions (Super Admin) | **🔒 Close month** (primary, open month only) · **Reopen** (secondary, latest closed month only) · **Monthly report** (everyone) |
| Blocked state | "Close {previous month} first — months close in order." in red text instead of the Close button |

**Staircase (the distributable calculation)**

- A row of cells: **Income** · **− Expense** · **− Reserve** · **− Previous deficit**, each with its amount, operator shown on the right of the label.
- Last cell filled yellow: **Distributable =** with the result in large type.
- Under it, only when relevant:
  - Red: "Expenses exceeded income — a deficit of ৳X carries into next month."
  - Muted: "৳X was paid from the Reserve, so it is not counted as an expense here."

**Owner distribution board — desktop table**

| Column | Content |
| --- | --- |
| Owner | Initials + name (tap → owner page), **You** tag |
| Share | % and units used for this month |
| Opening | Balance at the start of the month |
| Entitlement | This month's share — "(preview)" in the header while open |
| Received | Payouts recorded in this month |
| Advance | Advances recorded in this month |
| Loan ded. | Loan instalment deducted (or to be deducted on close) |
| Balance now / Balance | Current balance with Owed / Advance outstanding / Settled; while open also "after close ৳X" |
| Loan | Outstanding loan or "—" |
| (action) | **Pay** (Super Admin, when balance is positive and a month is open) |

**Owner distribution board — mobile**

One card per owner: initials, name, "{%} share", balance with label at the right; a grid of Opening, Entitlement, Received, Advance, Loan ded., Loan; full-width **Pay ৳X** button.

**Footer checks**

- ✓ "Σ entitlements ৳X = distributable ৳X" (green)
- "Shares used · Nasrin 40 · Rayhan 25 · Tanvir 15 · Farzana 10 · Sabrina 10"
- "Rounding · largest remainder, in paisa"

**Close month dialog**

- Title "Close month · {Month}"
- Checklist with ✓ / ⚠:
  - "Shares add up to 100% · 5 owners"
  - "{Previous month} is closed" (or "First month")
  - "{n} income entries recorded" / ⚠ "No income entered — you can still close"
  - "Every unit has paid rent" / ⚠ "1 unit(s) unpaid: Flat 3A"
- **What happens**:
  - "5 entitlement entries totalling ৳X"
  - "Loan instalment ৳5,000 deducted from Tanvir Ahmed" (one line per active loan with an instalment)
  - "{Month} locks — later fixes need a reopen or an Adjustment"
  - "Share snapshot saved · monthly email queued for the 5th, 9 am"
- **Not yet** / **🔒 Close & lock**

**Reopen dialog**

"Reopen {Month}? All N entitlement entries and any loan deductions are reversed. Every owner is notified, and on re-close they get a before → after summary." + required reason → **Reopen month**.

**Related settings (Settings page)**

- **Reserve holdback**: Off / Percent / Fixed; "Percent of (income − expenses), only when positive" or "Fixed amount per month (৳)"; "Reserve balance now ৳X".
- **Advance limit**: × each owner's average entitlement over the last 3 closed months.
- **Monthly email** day and **Email language**.

**Home dashboard tie-ins**

- "House this month" staircase with a **Draft** tag and "Every owner's share →" link.
- "Close-the-month reminder" strip: "{Month} is open. Flat 3A (Nusrat Jahan) has not paid rent yet." + **Review distribution**.
- Reconciliation tile: "Balanced · Fund matches the ledgers to the paisa" or "Check · Mismatch of ৳X".

### 2.2 Gaps found and decisions

| # | Gap in the design | Decision |
| --- | --- | --- |
| G1 | The "Shares add up to 100%" check passes whenever any units exist | Real check: at least one owner has units for this month and the share set is valid; otherwise **block** closing |
| G2 | Checklist mixes blocking checks and warnings with the same icon | Two kinds: **must pass** (red ✕, Close disabled) and **warnings** (amber ⚠, Close allowed) |
| G3 | Reserve can't be changed for one month (main PRD says it can) | Add **Reserve for this month** override on the open month (amount, reason) |
| G4 | Loan instalment is deducted in full even if the owner's entitlement is smaller | Deduct the **smaller of** instalment, loan outstanding and that month's entitlement; the rest waits for next month |
| G5 | Reopen doesn't warn about payouts already made from the closed month's entitlements | Reopen dialog lists payouts made since the close and warns that balances may go negative after re-close |
| G6 | No before → after view after a re-close | Re-close shows and emails a per-owner table: old entitlement → new entitlement → difference |
| G7 | "Closed by / on" is empty in the prototype | Closed months show "Closed by {Name} on {date}" and the reopen history |
| G8 | Owners who had 0 units that month are hidden, even if they had payments | Show every owner with units **or** any activity in that month; 0-unit owners show "—" for share |
| G9 | No way to pay everyone after the close | Add **Pay all owed** (Phase 2): one dialog, one row per owed owner, tick and confirm |
| G10 | Board has no column for Adjustments, Opening entries or Reversals | Add an **Other** column (shown only when not zero), with a tooltip listing what it contains |
| G11 | A closed month's numbers could shift if settings change later | Closed months always show the **snapshot** taken at close (income, expense, reserve, deficit, shares, entitlements) |
| G12 | Two people could press Close at the same time | Only the first close succeeds; the second sees "This month was just closed by {Name}." |
| G13 | No totals row on the board | Add a totals row: Σ entitlement, Σ received, Σ advance, Σ loan ded. |
| G14 | Reminder only appears on the dashboard | Phase 2: email reminder to the Super Admin if a month is still open on the 3rd of the next month |
| G15 | Nothing explains an empty or zero month | Clear zero states (see section 9); a zero-distributable month can still be closed |

---

## 3. Key Concepts

### Month (period)
The house's books are kept per calendar month (e.g. October 2026). A month is either **Open** (draft, can change) or **Closed** (locked). Several months can be open at once, but they close in order.

### Distributable
What is left to share among the owners after the month's expenses, the reserve holdback and any deficit carried from the previous month. It can't be negative; a shortfall becomes a **deficit** for next month.

### Reserve holdback
An optional amount kept back each month for big future costs (roof, pump, tax). Set in Settings as Off, a percent of (income − expenses), or a fixed amount. Money spent "from the Reserve" doesn't count as that month's expense.

### Deficit carried forward
When expenses are bigger than income, nobody pays in cash. The shortfall moves to the next month and is taken from that month's distributable first.

### Entitlement
An owner's share of a closed month's distributable, based on their share units for that month. It is added to the owner's balance only when the month closes; before that it is a **preview**.

### Share snapshot
The share units used for a month, saved at close. Later share changes never affect a closed month.

### Close
Turns the preview into real entitlements, takes loan instalments, saves the snapshot, locks the month's income and expenses, and opens the next month if needed.

### Reopen
Unlocks the most recent closed month so a mistake can be fixed. All its entitlements and loan deductions are reversed (kept visible), and they are posted again on re-close.

---

## 4. Who Can Do What

| Feature | Super Admin | Owner |
| --- | --- | --- |
| See any month's staircase and owner board | ✓ | ✓ |
| See the preview for open months | ✓ | ✓ |
| See the close checklist result and "what happens" | ✓ | ✗ |
| Close a month | ✓ | ✗ |
| Reopen the latest closed month | ✓ | ✗ |
| Override the reserve for an open month | ✓ | ✗ |
| Pay an owner from the board | ✓ | ✗ |
| Pay all owed (P2) | ✓ | ✗ |
| Open the Monthly report | ✓ | ✓ |
| See before → after after a re-close | ✓ | ✓ |
| See reopen history and reasons | ✓ | ✓ |

The server checks every action again, whatever the screen shows.

---

## 5. Features

### F1 · Month header and navigation — P1

- Same month picker as the rest of the app (previous / next / list); the chosen month is in the page link so it can be shared.
- Status tag: **Draft — not closed yet** (open) or **🔒 Closed** (closed).
- Sub-line:
  - Open: "Live preview — entitlements post when you close the month."
  - Closed: "Closed by {Name} on {date}" + "· reopened N×" when it was reopened.
- Opening the page with no month chosen shows the **oldest open month** (the one that must close next).

### F2 · Distributable staircase — P1

- Five cells in one ruled row: **Income**, **− Expense**, **− Reserve**, **− Previous deficit**, and the yellow **Distributable =** cell.
- Each cell can be tapped to see what it contains:
  - Income / Expense → opens Income & Expenses for that month on the right tab.
  - Reserve → shows the rule used ("5% of ৳89,020") or the override and its reason.
  - Previous deficit → links to the month it came from.
- Notes under the staircase, only when they apply:
  - Deficit created this month (red).
  - Money paid from the Reserve this month (muted).
  - Reserve overridden for this month (muted, with the reason).
- Closed months show the frozen snapshot values.
- On phones the cells stack in pairs; the Distributable cell is full width.

### F3 · Owner distribution board — P1

- **Desktop**: table with the columns in 2.1, plus **Other** (only when not zero) and a **totals row**.
- **Mobile**: one card per owner (2.1) with the balance at the top right and a full-width **Pay ৳X** button.
- Rows in owner display order; the viewer's row tagged **You**.
- Shows every owner who had units in that month or any entry in that month (G8).
- **Open month** (preview):
  - Entitlement column header says "Entitlement (preview)".
  - Loan ded. shows the instalment that **will** be taken on close.
  - Balance column is "Balance now" with a second line "after close ৳X" (balance now + entitlement − loan instalment).
- **Closed month**:
  - Shows the posted entitlements and deductions.
  - Balance column shows the balance at the end of that month.
- Tapping an owner opens their Owners page statement, filtered to that month.
- Amounts coloured and labelled by sign (Owed green, Advance outstanding red, Settled ink).

### F4 · Accuracy footer — P1

- Green check "Σ entitlements ৳X = distributable ৳X". If they ever differ, show a red warning and **block closing**.
- "Shares used · {first name} {units} · …" for the month.
- "Rounding · largest remainder, in paisa" with a ⓘ explaining: each share is rounded down to the paisa and the leftover paisa go to the largest remainders, ties by display order.

### F5 · Close month — P1 (Super Admin)

- **🔒 Close month** shows only on an open month whose previous month is closed (or the first month).
- If the previous month is still open, the button is replaced by "Close {previous month} first — months close in order." with a link to that month.
- Opens the **Close month dialog**:

  **Must pass (block Close if any fails, red ✕)**
  1. A valid share set exists for this month with at least one owner above 0 units.
  2. The previous month is closed (or this is the first month).
  3. Σ entitlements = distributable.
  4. Nobody else closed or reopened this month in the meantime.

  **Warnings (Close still allowed, amber ⚠)**
  1. No income entered for the month.
  2. Units that haven't paid rent: "1 unit unpaid: Flat 3A (Nusrat Jahan)".
  3. Expenses with no bill attached: "2 expenses have no bill".
  4. The month hasn't ended yet: "October isn't over — closing early means late entries go to November or an Adjustment."
  5. Reserve balance would go negative.

  **What happens** (plain list)
  - "{n} entitlement entries totalling ৳X"
  - One line per loan instalment: "Loan instalment ৳5,000 deducted from Tanvir Ahmed"
  - "{Month} locks — later fixes need a reopen or an Adjustment"
  - "Share snapshot saved"
  - "Monthly email queued for {day}, 9 am" (P2)
  - "{Next month} opens" (when it doesn't exist yet)

- Buttons **Not yet** / **🔒 Close & lock**.
- After closing: toast "{Month} closed · entitlements posted"; the board switches to the closed view; every owner's balance updates at once.

### F6 · What closing does — P1

When the Super Admin confirms, all of this happens together (all or nothing):

1. One **Entitlement** entry per owner with units, dated the last day of the month.
2. **Loan instalments** deducted for active loans with an instalment (rule in 7.5); loans reaching zero become Repaid.
3. A **snapshot** of income, expense, reserve, previous deficit, distributable, deficit carried, shares used and each entitlement.
4. The month's income and expenses become **locked**.
5. Reserve balance increases by the month's reserve.
6. The **next month opens** if it isn't open yet.
7. Audit log: "{Month} closed · distributable ৳X".
8. (P2) Monthly report email queued for the configured day.

### F7 · Reopen month — P1 (Super Admin)

- **Reopen** shows only on the **latest** closed month, and only if no later month is closed.
- Dialog:
  - "Reopen {Month}? All N entitlement entries and any loan deductions are reversed. Every owner is notified, and on re-close they get a before → after summary."
  - If payouts or advances were recorded after the close: "৳X was paid out after {Month} closed. Those payments stay; after re-close some balances may turn negative." with the list.
  - **Reason** (required, visible to everyone).
- Result:
  - Entitlements and loan deductions get **Void** and a **Reversal** each (kept visible in statements).
  - Loans that had become Repaid go back to Active.
  - Month status → Open; reopen count +1; the old snapshot is kept for the before → after comparison.
  - Toast "{Month} reopened · entitlements reversed · owners notified".
- Older closed months can't be reopened; the dialog explains: "Only the latest closed month can be reopened. For older months, record an Adjustment in the open month."

### F8 · Re-close with before → after — P1

- Closing a reopened month works like a normal close, plus a **Changes since last close** block in the dialog:
  - Staircase before → after (only lines that changed).
  - Per owner: old entitlement → new entitlement → difference (+ / −).
- After re-close, the closed month page shows a **Reopened** note with date, reason, and a "See changes" link to the same before → after table.
- (P2) Every owner gets an email with that table.

### F9 · Reserve — P1

- Reserve uses the rule in Settings: **Off**, **Percent** of (income − expense) when positive, or **Fixed** amount (never more than income − expense).
- Percent results are rounded to whole taka.
- **Reserve for this month** (Super Admin, open month): override the amount with a reason; shows "Overridden" in the staircase note; can be reset to the rule.
- **Reserve balance** = reserve kept in all closed months − expenses paid from the Reserve (shown in Settings and on the Reserve cell's detail).
- Closing with a reserve-paid expense larger than the reserve balance shows a warning (not a block).

### F10 · Deficit carry-forward — P1

- If income − expense − reserve − previous deficit is below zero, the distributable is ৳0 and the shortfall becomes the **deficit carried** to the next month.
- No reserve is held back in a month with no surplus.
- The next month's staircase shows it as **− Previous deficit**, tappable to the month it came from.
- All owners get ৳0 entitlement in a deficit month; nobody is asked to pay in.

### F11 · Loan instalments on close — P1

- Active loans with a monthly instalment are deducted automatically on close.
- The board shows the coming deduction in the preview and the posted one after close.
- Rule in 7.5; the deduction appears in the owner's statement as **Loan deduction** and lowers the loan outstanding.

### F12 · Pay from the board — P1 (Super Admin)

- **Pay** on any row with a positive balance (needs an open month to post the payment).
- Opens the Owners section's payment drawer pre-filled with the owner and full balance.
- After saving, the row's Received and Balance update immediately.

### F13 · Pay all owed — P2 (Super Admin)

- Button **Pay all owed** above the board when 2+ owners have a positive balance.
- Dialog: one row per owed owner — tick, amount (default full balance), method, reference no.; a shared date and fund account; total.
- Warning if the total is more than the chosen fund account holds.
- Saves one payout per ticked owner; one audit entry "Paid N owners ৳X".

### F14 · Close reminders — P1 / P2

- **P1** Dashboard strip for the Super Admin when the previous month is still open: "{Month} is open." + unpaid units + **Review distribution**.
- **P2** Email to the Super Admin on the 3rd of the next month (9 am Dhaka) if the month is still open.

### F15 · Closed-month record — P1

- Closed months show: closed by and date, the snapshot staircase, the board with posted entries, reopen history (date, by whom, reason) and links to the Monthly report and Audit log.
- Changing Settings (reserve rule, shares) never changes a closed month's numbers.

### F16 · Months overview — P2

- A **All months** link opens a simple list: month, status (Open / Closed / Reopened N×), income, expense, reserve, deficit, distributable, closed by/on.
- Tap a month → its Distribution page.

---

## 6. User Flows

### 6.1 Normal month close (Super Admin)

1. Early November, the dashboard shows "October 2026 is open. Flat 3A (Nusrat Jahan) has not paid rent yet." → **Review distribution**.
2. Distribution for October: staircase ৳1,03,000 − ৳13,980 − ৳4,451 − ৳0 = **৳84,569**; board shows each owner's preview.
3. Rent from 3A arrives → recorded in Income & Expenses; staircase updates live.
4. **Close month** → checklist all green, "What happens" lists 5 entitlements and Tanvir's ৳5,000 loan instalment.
5. **Close & lock** → October locked, November opens, balances updated.
6. **Pay** on each owed row (or **Pay all owed** in P2).

### 6.2 Owner checks their share

1. Owner opens **Distribution** (or "Every owner's share →" on Home).
2. Sees the staircase and their row tagged **You**: "Entitlement (preview) ৳8,456.90", "after close ৳17,160.80".
3. Taps their name → their statement for that month.

### 6.3 Fixing a closed month (latest)

1. A ৳5,000 repair bill for September was missed; September is the latest closed month.
2. Super Admin opens September → **Reopen** → reason "Plumber bill was missed" → confirm.
3. Adds the expense in Income & Expenses (September is open again).
4. **Close month** → "Changes since last close" shows Expense +৳5,000, Distributable −৳4,750 (after reserve), each owner's difference.
5. Close & lock; everyone sees the reopen note and changes.

### 6.4 Fixing an older month

1. A mistake is found in June; July–September are closed.
2. Reopen isn't offered for June; the hint says to use an Adjustment.
3. Super Admin records an Adjustment in the open month with reference month June (Income & Expenses or Owners section).

### 6.5 Deficit month

1. April: income ৳1,25,000, expenses ৳1,70,780 (roof waterproofing).
2. Staircase shows Distributable ৳0 and "Expenses exceeded income — a deficit of ৳45,780 carries into next month."
3. Close → every owner gets ৳0 entitlement.
4. May's staircase shows "− Previous deficit ৳45,780".

---

## 7. Calculation Rules

### 7.1 Staircase

- **Income** = all income entries of the month that are not voided.
- **Expense** = all expense entries of the month that are not voided and **not** paid from the Reserve.
- **Surplus** = Income − Expense.
- **Reserve** = by the Settings rule, only when Surplus is above zero:
  - Off → ৳0
  - Percent → Surplus × percent, rounded to whole taka
  - Fixed → the fixed amount, but never more than Surplus
  - Month override replaces the rule for that month.
- **Net** = Surplus − Reserve − Previous deficit.
- **Distributable** = Net if Net is above zero, otherwise ৳0.
- **Deficit carried** to next month = the shortfall if Net is below zero, otherwise ৳0.

### 7.2 Entitlement per owner

- Owner's entitlement = Distributable × owner's units ÷ total units of that month's share set.
- Calculated in paisa: each owner's share is rounded **down** to the paisa; the leftover paisa (always fewer than the number of owners) go one each to the owners with the largest remainders; ties go by display order.
- The total of all entitlements always equals the Distributable exactly.

### 7.3 Board figures

- **Opening** = owner balance at the end of the previous month.
- **Received** = payouts recorded in this month.
- **Advance** = advances recorded in this month.
- **Loan ded.** = loan deductions of this month (preview: what close will deduct).
- **Other** = adjustments, opening entries and reversals in this month.
- **Balance** = Opening + Entitlement − Received − Advance − Loan ded. ± Other.
- **After close** (open month) = Balance now + preview Entitlement − preview Loan ded.

### 7.4 Reserve balance

- Reserve balance = starting reserve + reserve kept in every closed month − expenses paid from the Reserve.

### 7.5 Loan instalment on close

- For each active loan with an instalment: deduct the **smallest** of (instalment, loan outstanding, that owner's entitlement this month that is still free after earlier deductions).
- If nothing can be deducted (entitlement ৳0), the instalment is skipped for that month and noted in the close summary: "Tanvir's instalment skipped — no entitlement this month."
- A loan reaching ৳0 outstanding becomes **Repaid**.

### 7.6 House Fund check (shown on Home)

- House Fund = all owner balances + reserve balance + open months' (income − expense) − deficit carried − loans outstanding.
- Match → "Balanced"; mismatch → "Check · Mismatch of ৳X".

---

## 8. Business Rules

1. Months close strictly in order; a month can't close while an earlier month is open.
2. Several months may be open at once (e.g. October waiting for late rent while November starts).
3. Only the **latest** closed month can be reopened; reopening needs a reason.
4. Closing and reopening are all-or-nothing: either everything in F6 / F7 happens, or nothing does.
5. Only one close or reopen can run on a month at a time; the second attempt is refused with a clear message.
6. A closed month's numbers come only from its snapshot; settings and share changes never alter it.
7. A closed month's income and expenses can't be added, edited or voided.
8. Entitlements are posted only by Close and removed only by Reopen (as reversals); nobody can edit or void them by hand.
9. A deficit is carried forward automatically; owners are never charged for it.
10. No reserve is kept in a month with no surplus.
11. The sum of entitlements must equal the distributable or closing is blocked.
12. Owners with 0 units in a month get no entitlement for it.
13. A reopen keeps every original entry visible with **Void** plus its **Reversal**.
14. Payments recorded after a close stay valid when that month is reopened.
15. Money shows as ৳ with lakh grouping (৳1,03,000); Bangla digits in Bangla; paisa only when not zero.
16. Colour always comes with a word (Owed, Advance outstanding, Settled, Deficit).

---

## 9. Messages, Warnings & Empty States

| Situation | Message |
| --- | --- |
| Open month sub-line | "Live preview — entitlements post when you close the month." |
| Closed month sub-line | "Closed by {Name} on {date}" (+ "· reopened N×") |
| Previous month still open | "Close {Month} first — months close in order." |
| Deficit this month | "Expenses exceeded income — a deficit of ৳X carries into next month." |
| Reserve-paid expenses | "৳X was paid from the Reserve, so it is not counted as an expense here." |
| Reserve overridden | "Reserve set to ৳X for this month · {reason}" |
| No income | ⚠ "No income entered — you can still close." |
| Unpaid rent | ⚠ "{n} unit(s) unpaid: {units}" |
| Bills missing | ⚠ "{n} expenses have no bill attached." |
| Month not over | ⚠ "{Month} isn't over — late entries will go to {next month} or an Adjustment." |
| Share set missing | ✕ "No shares set for {Month}. Set shares in Owners first." |
| Totals mismatch | ✕ "Entitlements don't add up to the distributable — contact support before closing." |
| Someone else closed it | "{Month} was just closed by {Name}." |
| Reopen not allowed | "Only the latest closed month can be reopened. For older months, record an Adjustment in the open month." |
| Reopen without reason | "Please write a reason — everyone can see it." |
| Close done | "{Month} closed · entitlements posted" |
| Reopen done | "{Month} reopened · entitlements reversed · owners notified" |
| Loan instalment skipped | "{Name}'s instalment skipped — no entitlement this month." |
| Zero distributable | Staircase shows ৳0 in the yellow cell; board shows ৳0 entitlements; Close still allowed |
| No months yet (setup) | "Your first month opens when setup is finished." + **Finish setup** |
| Month with no owners | "No owners have shares for {Month}." + **Set shares** (Super Admin) |

---

## 10. Notifications

| Event | Who is told | Phase |
| --- | --- | --- |
| Month still open on the 3rd of next month | Super Admin | P2 |
| Monthly report after close (house summary + own entitlement, received, balance, loan) | All active owners, on the Settings day (default 5th, 9 am Dhaka) | P2 |
| Month reopened (month, reason, who) | All owners | P2 |
| Month re-closed (before → after per owner) | All owners | P2 |
| Loan instalment deducted / skipped | The borrowing owner (inside the monthly report) | P2 |
| Reserve overridden for a month | All owners (inside the monthly report) | P2 |

Emails are short, in each person's language, and link to the Distribution page; they never include other owners' contact details.

---

## 11. Worked Examples

All figures come from the design's sample data (Ahmed Villa, shares 40 : 25 : 15 : 10 : 10, reserve rule 5%).

### 11.1 October 2026 preview (open)

| Staircase | Amount |
| --- | --- |
| Income (5 flats + shop, Flat 3A unpaid; rooftop lease) | ৳1,03,000 |
| − Expense (electricity, water, gas, cleaning) | ৳13,980 |
| − Reserve (5% of ৳89,020) | ৳4,451 |
| − Previous deficit | ৳0 |
| **= Distributable** | **৳84,569** |

| Owner | Share | Balance now | Entitlement (preview) | Loan ded. | After close |
| --- | --- | --- | --- | --- | --- |
| Nasrin Ahmed | 40% | −৳5,000 (advance) | ৳33,827.60 | — | ৳28,827.60 |
| Rayhan Ahmed | 25% | ৳0 | ৳21,142.25 | — | ৳21,142.25 |
| Tanvir Ahmed | 15% | ৳8,055.85 | ৳12,685.35 | ৳5,000 | ৳15,741.20 |
| Farzana Haque | 10% | ৳8,703.90 | ৳8,456.90 | — | ৳17,160.80 |
| Sabrina Ahmed | 10% | ৳0 | ৳8,456.90 | — | ৳8,456.90 |
| **Total** | 100% | | **৳84,569.00** | ৳5,000 | |

Close checklist: all must-pass checks ✓; warning "1 unit unpaid: Flat 3A".

### 11.2 Deficit carried (April → May 2026)

| | April | May |
| --- | --- | --- |
| Income | ৳1,25,000 | ৳1,25,000 |
| − Expense | ৳1,70,780 (roof waterproofing ৳1,45,000) | ৳26,780 |
| Surplus | −৳45,780 | ৳98,220 |
| − Reserve (5%, only on surplus) | ৳0 | ৳4,911 |
| − Previous deficit | ৳0 | ৳45,780 |
| **Distributable** | **৳0** | **৳47,529** |
| Deficit carried | ৳45,780 | ৳0 |

### 11.3 Rounding

Distributable ৳1,000 among three owners with 1 : 1 : 1 units → ৳333.34, ৳333.33, ৳333.33 (the extra paisa to the first by display order); total ৳1,000.00.

---

## 12. Acceptance Criteria

### Staircase and board
- [ ] Staircase values match Income & Expenses totals for the month (voided and reserve-paid excluded)
- [ ] Reserve follows the Settings rule, is ৳0 in a no-surplus month, and a month override replaces it
- [ ] Deficit appears in the next month as "Previous deficit" and the distributable never goes below ৳0
- [ ] Σ entitlements = distributable to the paisa in every month
- [ ] Open months show "(preview)" and "after close"; closed months show posted values
- [ ] Closed months show snapshot values even after Settings or shares change
- [ ] Owners with activity but 0 units still appear on the board
- [ ] Mobile cards show the same numbers as the desktop table

### Close
- [ ] Close is offered only on an open month whose previous month is closed
- [ ] Any failed must-pass check disables **Close & lock**; warnings don't
- [ ] Close creates one entitlement per owner with units, loan deductions per 7.5, the snapshot, the lock, and the next month
- [ ] A loan instalment never makes a deduction larger than that month's entitlement or the loan outstanding
- [ ] Income and expenses of a closed month can't be added, edited or voided
- [ ] Two simultaneous closes produce one close and one clear refusal

### Reopen and re-close
- [ ] Reopen is offered only on the latest closed month and needs a reason
- [ ] Reopen reverses entitlements and loan deductions, keeps originals visible, and makes repaid loans active again
- [ ] Reopen warns about payouts made since the close
- [ ] Re-close shows before → after per owner and records the reopen history

### General
- [ ] Owners see the staircase, board and history but no Close, Reopen, Pay or override controls, and are refused if they try
- [ ] Every close, reopen and reserve override is in the Audit Log with who, when and reason
- [ ] All screens work at 360px width, in বাংলা and English

---

## 13. Release Phases

| Phase | Features |
| --- | --- |
| **P1 — MVP** | F1 Header & navigation · F2 Staircase · F3 Owner board · F4 Accuracy footer · F5 Close month · F6 What closing does · F7 Reopen · F8 Re-close before → after · F9 Reserve (rule, override, balance) · F10 Deficit · F11 Loan instalments · F12 Pay from board · F14 Dashboard reminder · F15 Closed-month record |
| **P2** | F13 Pay all owed · F14 email reminder · F16 Months overview · all emails in section 10 |
| **P3** | Owner sign-off on a closed month ("I've seen it") · multi-house distribution · scheduled auto-close on a set day with Super Admin confirmation |

---

## 14. Open Questions

- [ ] Should closing be blocked (not just warned) while any unit hasn't paid rent?
- [ ] Should the Super Admin be allowed to close a month before it ends?
- [ ] When a loan instalment can't be fully taken, should the shortfall be added to next month's instalment or just wait?
- [ ] Should a reserve override need another owner's agreement?
- [ ] Can reserve money ever be released back to owners (e.g. once the reserve passes a target)? If yes, how?
- [ ] Should reopening require a second owner's approval when payouts have already been made?
- [ ] Should owners see each other's "after close" balances in the preview, or only their own?