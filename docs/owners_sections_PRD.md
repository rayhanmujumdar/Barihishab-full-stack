# BariHisab — Owners Section PRD

> Version 1.0 · Nov 9, 2026 · Author: Rayhan (dev4@awfatech.com)
> Section: Owners (owner list, owner detail & statement, share management, payments and advances from an owner's page)
> Depends on: Authentication & roles, Income & Expenses, Month close (Distribution), Advances & Loans

This document covers **features and behaviour only**. Technical design (database, API, code structure) is left to the implementation.

## Table of Contents

1. [Overview](#1-overview)
2. [Design Analysis](#2-design-analysis)
3. [Key Concepts](#3-key-concepts)
4. [Who Can Do What](#4-who-can-do-what)
5. [Features](#5-features)
6. [User Flows](#6-user-flows)
7. [Business Rules](#7-business-rules)
8. [Messages, Warnings & Empty States](#8-messages-warnings--empty-states)
9. [Notifications](#9-notifications)
10. [Worked Example](#10-worked-example)
11. [Acceptance Criteria](#11-acceptance-criteria)
12. [Release Phases](#12-release-phases)
13. [Open Questions](#13-open-questions)

---

## 1. Overview

The Owners section answers one question for every co-owner: **"What is my share, what has the house owed me, what have I received, and where do I stand today?"** It is also where the bookkeeper changes ownership shares and pays owners.

### Goals

- Every owner can see every owner's share, balance, loan and full statement — the house's books are transparent.
- An owner's balance can be explained line by line, like a bank statement.
- Share changes (gift, inheritance, sale) never change months that are already closed.
- The bookkeeper can pay an owner in three taps, and a wrong payment can be reversed without deleting anything.

### In scope

- Owner list with share, balance and loan
- Owner detail: summary figures, statement with running balance, share history
- Statement for any month range, downloadable as PDF
- Change shares (new share set from a chosen month)
- Add an owner, edit owner details, former owners
- Opening balances when the app starts
- Pay an owner (with split when paying more than the balance)
- Record an advance
- Void a payment or advance (reversal)
- Owner balance adjustment for old-month corrections
- Payment receipts and emails (Phase 2)

### Out of scope

- Month close and entitlement calculation (Distribution section)
- Loan creation, instalments and repayments (Advances & Loans section — the Owners page only shows the loan amount)
- Money requests from owners (Requests section)
- User accounts, invites and login (Users / Authentication)

### Success metrics

| Metric | Target |
| --- | --- |
| Owners who open their own statement at least once a month | ≥ 80% |
| Time for the bookkeeper to record a payment | < 30 seconds |
| Statement closing balance equals the balance shown on the list | 100% of the time |
| Share changes saved without a reason | 0 |
| Disputes about "how much I got" that the statement can't answer | 0 |

---

## 2. Design Analysis

What the BariHisab design already shows for this section, and what it leaves open.

### 2.1 What the design shows

**Owner list (`/owners`)**

| Element | Behaviour in the design |
| --- | --- |
| Header | Kicker "{House name} · {total} share units", title "Owners"; **Change shares** button for Super Admin |
| Owner card (one per owner) | Square initials avatar, name, house responsibility (e.g. "Elder · signs bank cheques"), share % in large type |
| Tags on the card | **You** (the viewer), **Super Admin**, **Invite pending** (user hasn't set a password), "{n} units" |
| Balance on the card | Label **Owed** / **Advance outstanding** / **Settled**, amount in green / red / ink |
| Loan on the card | Outstanding loan amount or "None" |
| Tap a card | Opens that owner's detail |

**Owner detail (`/owners/:id`)**

| Element | Behaviour in the design |
| --- | --- |
| Back link | "← All owners" |
| Header | Initials, kicker "Owner statement · {responsibility}", name, email · phone |
| Actions (Super Admin, needs an open month) | **Record advance** (secondary), **Pay** (primary) |
| Summary strip | Balance (with label and colour) · Share % and units · Entitlement this year · Paid out this year · Loan |
| Statement | From month / to month pickers, **PDF** button; table: Date, Month, Type, Note (with reference no.), Amount, Running balance, Void action |
| Statement rows | "Brought forward" first, "Closing balance" last; voided rows struck through with a **Void** tag |
| Legend | "Positive = the house owes this owner. Negative = advance outstanding. Voided entries stay visible; their reversal cancels them." |
| Share history | "From {month} · {units} units · {reason}", newest first |

**Change shares dialog**

- Body: "A new version starts on the 1st of the chosen month. Closed months keep the shares they were closed with."
- One row per owner: name, units input, live %.
- Total line "{n} units = 100%".
- **Effective from** month (open months or next month), **Reason (required)** with hint "Inheritance deed dated…".
- **Cancel** / **Save share set**.

**Pay / advance drawer (shared entry drawer)**

- Owner picker with a balance panel: "{Name} · balance ৳X (owed)", "Against: {oldest month due}", **Use full balance ৳X**.
- Amount, Date, Fund account (with balance), Method (Cash / Bank / bKash / Nagad), Reference no. ("bKash TrxID or cheque no."), Note, receipt attachment.
- Warning when paying more than the balance or more than the House Fund holds.
- Paying more than the balance opens **"More than the balance"**: Payout ৳X / Excess ৳Y → **Record excess as an advance** · **Record excess as a loan** · **Change the amount**.
- Advance needs a reason visible to all owners.

**Void dialog for a payment/advance**

"Void this payout? A reversal of ৳X is posted in {open month}. The balance and the House Fund return to where they were; the original stays visible with a Void mark." + required reason → **Post reversal**.

### 2.2 Sample data in the design

| Owner | Responsibility | Units (from June 2026) | Share | Balance (22 Oct 2026) | Loan |
| --- | --- | --- | --- | --- | --- |
| Nasrin Ahmed | Elder · signs bank cheques | 40 | 40% | Advance outstanding ৳5,000 | None |
| Rayhan Ahmed (Super Admin) | Bookkeeper · electricity & gas bills | 25 | 25% | Settled | None |
| Tanvir Ahmed | Tenant issues & repairs | 15 | 15% | Owed ৳8,055.85 | ৳35,000 |
| Farzana Haque | — | 10 | 10% | Owed ৳8,703.90 | None (repaid) |
| Sabrina Ahmed (invite pending) | — | 10 | 10% | Settled | None |

Share history example: Jan 2026 Nasrin 50 · Rayhan 25 · Tanvir 15 · Farzana 10 → June 2026 Nasrin 40 and Sabrina 10 ("Gifted 10 units to Sabrina, deed 20 May 2026").

### 2.3 Gaps found and decisions

| # | Gap in the design | Decision |
| --- | --- | --- |
| G1 | No way to add a new owner | Add **Add owner** (Super Admin): link an existing user or create a name-only owner, then give units through Change shares |
| G2 | No way for an owner to leave (sold share, gave it all away) | An owner set to 0 units becomes a **Former owner**: kept in a separate list with their history and balance until settled |
| G3 | No owner without a login (deceased owner, estate, minor) | Allow a **name-only owner** with no login; shown with a "No login" tag |
| G4 | "Entitlement 2026" and "Paid out 2026" are fixed to one year | Summary uses the **current calendar year**, with a year switcher |
| G5 | "Paid out" in the prototype counts voided payments too | Paid out = payments + advances **minus their reversals** |
| G6 | Statement "to" list ends at a hard-coded month | "To" offers every month up to the latest open month, plus **Latest** |
| G7 | Only payments and advances can be voided; no fix for an owner-specific mistake in an old month | Add **Balance adjustment** (Super Admin) with a required reason and reference month |
| G8 | **Pay** pre-fills the full balance even when the balance is zero or negative | When balance ≤ 0, Pay opens with an empty amount and the warning "Nothing is owed — anything you pay becomes an advance or loan" |
| G9 | Owners see everyone's email and phone in the detail header | Kept (family app, logged-in members only), but each owner can hide their phone in their profile |
| G10 | No order control for the owner list | Super Admin can set the display order; the same order breaks rounding ties |
| G11 | Opening balances (money owed before the app) have no screen | One-time **Opening balance** step per owner, editable only until the first month is closed |
| G12 | No print view or receipt for a payment | PDF statement in Phase 1; payment receipt PDF + email in Phase 2 |

---

## 3. Key Concepts

### Owner
A person (or estate) who holds part of the house. An owner may or may not have a login. The Super Admin is usually also an owner, but being an owner and being an admin are separate things.

### Share units and share %
Shares are stored as whole **units** (e.g. 40 : 25 : 15 : 10 : 10). The % is calculated from the units (40 of 100 = 40%). Units make even splits exact (1 : 1 : 1 = one third each). The screen always shows both.

### Share set
All owners' units together, valid **from the 1st of a month**. A change creates a new share set; the old one stays in history. A closed month always uses the share set it was closed with.

### Owner balance
One running number per owner:
- **Positive → Owed**: the house owes this owner money (green).
- **Negative → Advance outstanding**: the owner has taken more than earned (red).
- **Zero → Settled** (ink on grey).

### Statement entries

| Entry | What it means | Effect on balance |
| --- | --- | --- |
| Opening | Balance carried in from before the app | + or − |
| Entitlement | The owner's share of a closed month | + |
| Payout | Money paid to the owner from the House Fund | − |
| Advance | Money paid beyond what is owed | − |
| Loan deduction | Loan instalment taken from the entitlement | − |
| Adjustment | Correction for an old month, with a reason | + or − |
| Reversal | Cancels a voided payout or advance | opposite of the original |

### Brought forward / Closing balance
The statement starts with the balance before the chosen period ("Brought forward") and ends with the balance after it ("Closing balance"). Closing of one month = opening of the next.

---

## 4. Who Can Do What

| Feature | Super Admin | Owner |
| --- | --- | --- |
| See owner list, all shares, balances, loans | ✓ | ✓ |
| Open any owner's detail and statement | ✓ | ✓ |
| Download statement PDF | ✓ | ✓ |
| See share history | ✓ | ✓ |
| Change shares | ✓ | ✗ |
| Add owner / edit owner / reorder / mark former | ✓ | ✗ |
| Set opening balances | ✓ | ✗ |
| Pay an owner | ✓ | ✗ |
| Record an advance | ✓ (also for self, tagged "Self") | ✗ (requests one in Requests) |
| Void a payout or advance | ✓ | ✗ |
| Balance adjustment | ✓ | ✗ |
| Hide own phone number from other owners | ✓ | ✓ |
| Confirm "I received this payment" (P3) | ✓ (own only) | ✓ (own only) |

Buttons a person can't use are not shown. The server checks every action again, whatever the screen shows.

---

## 5. Features

### F1 · Owner list — P1

- One card per **current** owner, in the set display order.
- Card shows: initials, name, house responsibility, share % (big), tags (You, Super Admin, Invite pending, No login, "{n} units"), balance with label and colour, loan outstanding or "None".
- Header shows the house name and the total share units in force today.
- Super Admin sees **Change shares** and **Add owner**.
- A **Former owners** link under the list (only when there are any) shows owners with 0 units, their last balance and the month they left.
- Tap a card → owner detail.
- Layout: grid of cards, 1 column on phones, 2–3 on desktop, separated by ruled lines (design system).

### F2 · Owner detail — summary — P1

- "← All owners" back link.
- Header: initials, "Owner statement · {responsibility}", name, email and phone (phone hidden if the owner chose to).
- Summary strip with five figures:
  1. **Balance** with Owed / Advance outstanding / Settled label and colour
  2. **Share** % and units in force today
  3. **Entitlement {year}** — sum of this year's entitlements
  4. **Paid out {year}** — payouts + advances this year, minus reversals
  5. **Loan** outstanding or "None"
- Year switcher for figures 3 and 4 (default: current year).
- Super Admin actions: **Pay** (primary), **Record advance**, and a **More** menu with **Balance adjustment**, **Edit owner**. Pay and Record advance need at least one open month; otherwise they are disabled with the tooltip "Open a month first".

### F3 · Owner statement — P1

- **From** and **To** month pickers. Default: January of the current year → Latest.
- First row **Brought forward** = balance before the From month.
- One row per entry, oldest first: Date · Month · Type · Note (+ reference no.) · Amount (+ green, − ink) · Running balance (coloured by sign).
- Voided rows stay, struck through and grey, with a **Void** tag; their reversal row cancels them, so the running balance stays correct.
- Last row **Closing balance**.
- Legend under the table (text from 2.1).
- Super Admin sees **Void** on non-voided Payout and Advance rows when a month is open.
- Tap a row → small detail panel: who recorded it, when, fund account, method, reference no., receipt image, and for reversals a link to the original.
- On phones the table scrolls sideways; Date, Type and Amount stay readable without scrolling.
- Empty range: "No entries between {From} and {To}." with the brought forward and closing still shown.

### F4 · Statement PDF — P1

- **PDF** button downloads the statement for the chosen range.
- Contents: house name and address, owner name, share %, period, generated date and by whom, the full table (Brought forward → Closing), totals per entry type, the legend, and a page footer "Generated by BariHisab · page X of Y".
- In the viewer's language (বাংলা or English), Bangla digits when in Bangla.
- File name: `BariHisab-Statement-{OwnerName}-{From}-{To}.pdf`.

### F5 · Share history — P1

- On each owner's detail: list of that owner's share versions — "From {month} · {units} units · {reason}", newest first, with who made the change.
- On the list page (Super Admin and owners): **Share timeline** link showing every share set of the house: effective month, each owner's units and %, reason, changed by.

### F6 · Change shares — P1 (Super Admin)

- Opens from **Change shares** on the owner list.
- One row per current owner with units pre-filled from today's share set, plus **+ Add an owner to this share set** (pick a linked or name-only owner who has no units yet).
- Live % per row (1 decimal) and a total line "{n} units = 100%".
- **Effective from**: any open month or the next month. Never a closed month.
- **Reason**: required (e.g. "Inheritance deed dated 12 March 2026").
- Before saving, a confirmation shows **before → after** for every changed owner and: "Closed months keep their old shares. {Month} and later will use the new ones."
- Setting an owner to 0 units makes them a Former owner from that month (asks for confirmation).
- If an open month after the effective month already has entries, its preview recalculates at once.
- Saved as one share set; every owner sees it in the share timeline.

### F7 · Add owner — P1 (Super Admin)

- Choose **Link a user** (pick from users who are not yet owners) or **Name only (no login)** (for a deceased owner's estate, a minor, or someone who doesn't use the app).
- Fields: display name (pre-filled from the user), short name / initials, display order.
- A new owner starts with 0 units and doesn't count in any month until a share change gives them units.
- After saving, the app offers **Give shares now** → opens Change shares.

### F8 · Edit owner — P1 (Super Admin)

- Edit display name, initials, display order, and link/unlink a login (e.g. an heir starts using the app).
- Name changes show everywhere, including old statements; the audit log keeps the old name.
- An owner can never be deleted.

### F9 · Former owners — P1

- Owners at 0 units move to the **Former owners** list.
- Their statement, share history and balance stay visible to everyone.
- They can still be paid (to settle a remaining balance) or adjusted.
- They get no entitlement for months after they left.
- They can become an owner again through Change shares.

### F10 · Opening balances — P1 (Super Admin, setup)

- During setup, each owner can get one **Opening** entry: amount owed (+) or advance outstanding (−) on the start date, with a note (e.g. "Owed from the 2025 notebook").
- Editable until the first month is closed; after that, corrections go through Balance adjustment.

### F11 · Pay an owner — P1 (Super Admin)

- From **Pay** on the owner detail (or from Distribution).
- Balance panel: "{Name} · balance ৳X (owed)", "Against: {oldest unpaid month}", **Use full balance ৳X**.
- Fields: amount, date (default today), fund account (shows its balance), method (Cash / Bank / bKash / Nagad), reference no. (needed for Bank, bKash, Nagad), note, receipt photo (optional).
- Partial payments are allowed; each is its own entry.
- Paying more than the balance opens **"More than the balance"**:
  - Payout = the owed amount, Excess = the rest
  - **Record excess as an advance** · **Record excess as a loan** · **Change the amount**
- Warning (doesn't block) if the amount is more than the chosen fund account or the whole House Fund holds.
- Saved → toast "Payment of ৳X recorded for {Name}"; balance, list, House Fund and dashboard update at once.

### F12 · Record an advance — P1 (Super Admin)

- From **Record advance** on the owner detail (approved requests also create advances through Requests).
- Fields: amount, date, fund account, method, reference no., **reason (required, visible to all owners)**.
- Warning (doesn't block) if the advance goes over the advance limit in Settings (default: 1× the owner's average entitlement over the last 3 closed months): "Above the advance limit — allowed, but flagged."
- If the Super Admin records an advance for themself, it is tagged **Self** and every owner is told (Phase 2 email).
- The owner's next entitlements fill a negative balance first; no separate "settle" step.

### F13 · Void a payout or advance — P1 (Super Admin)

- **Void** on a Payout or Advance row of the statement.
- Dialog explains: a reversal of ৳X is posted in the latest open month; the balance and House Fund return to where they were; the original stays visible with a Void mark.
- Reason required; visible to every owner.
- Result: the original row gets **Void**, a **Reversal** row appears, the running balance is back to before.
- Entitlements and loan deductions can't be voided here — they change only through Reopen month (Distribution).
- A voided entry can't be voided again or edited.

### F14 · Balance adjustment — P1 (Super Admin)

- For owner-specific corrections in a month that can no longer be reopened (e.g. a payout recorded against the wrong owner in June).
- Fields: owner, amount (+ owed / − reduce), reference month, reason (required).
- Posted in the latest open month; shows as **Adjustment** in the statement with "for {reference month}".
- Does not change the House Fund.

### F15 · Payment receipt & email — P2

- After every payout or advance, a one-page receipt PDF: house, owner, amount, date, method, reference no., recorded by, new balance.
- Emailed to that owner (they can turn it off in profile); also downloadable from the statement row.

### F16 · "I received it" confirmation — P3

- The paid owner sees **Confirm received** on their own payout rows; confirmed rows show a ✓ "Confirmed by {Name} on {date}".
- Unconfirmed payouts older than 7 days show a gentle reminder to that owner.

### F17 · Owner's own shortcuts — P1

- Home page "Statement →" link opens the viewer's own owner detail.
- The viewer's own card is tagged **You** and shown first on phones (other cards keep their order).

---

## 6. User Flows

### 6.1 Owner checks where they stand

1. Owner opens **Owners** → sees all five cards; their own is tagged **You**.
2. Taps their card → balance "Owed ৳8,703.90", share 10%, entitlement this year, paid out this year.
3. Sets the statement to **Aug 2026 → Latest** → sees Brought forward, each month's entitlement and payout, closing balance.
4. Taps **PDF** to keep a copy.

### 6.2 Bookkeeper pays an owner after the month close

1. Super Admin opens Farzana's detail → **Pay**.
2. Balance panel shows ৳8,703.90 owed, "Against: September 2026" → taps **Use full balance**.
3. Picks bKash, enters TrxID, saves.
4. Balance becomes **Settled**; the statement shows the Payout; House Fund drops by ৳8,703.90.

### 6.3 Paying more than owed

1. Super Admin enters ৳13,000 for Tanvir (owed ৳8,055.85).
2. Dialog: Payout ৳8,055.85, Excess ৳4,944.15.
3. Chooses **Record excess as an advance** → two rows: Payout and Advance; balance −৳4,944.15 (Advance outstanding).

### 6.4 Share change after a gift

1. Super Admin taps **Change shares**.
2. Changes Nasrin 50 → 40 and adds Sabrina 0 → 10; total 100 units.
3. Effective from **June 2026**; reason "Gifted 10 units to Sabrina (deed 20 May 2026)".
4. Confirmation shows before → after; saves.
5. January–May keep 50 : 25 : 15 : 10; June onwards uses 40 : 25 : 15 : 10 : 10. Sabrina appears on the list.

### 6.5 Fixing a wrong payment

1. Super Admin sees a ৳5,000 payout recorded for the wrong owner.
2. Taps **Void** on that row → reason "Recorded for the wrong owner" → **Post reversal**.
3. Records the payout again for the right owner.
4. Both owners' statements show exactly what happened.

### 6.6 An owner passes away

1. Super Admin **Edits** the owner: unlinks the login, renames to "Estate of {Name}" (or keeps the name), adds a note.
2. When the heirs are known: **Change shares** from the next open month, moving the units to the heirs (adding new owners if needed), reason "Inheritance — succession certificate dated …".
3. The estate keeps its balance until paid out; with 0 units it moves to Former owners.

---

## 7. Business Rules

### Shares

1. Units are whole numbers ≥ 0. At least one owner must have more than 0.
2. The % always comes from units; displayed with 1 decimal, but money is always split from the units, not from the rounded %.
3. A share set starts on the 1st of a month and can't start in a closed month.
4. Every share change needs a reason.
5. Closed months keep the share set they were closed with, even after a reopen.
6. Only one share set can start in a given month; saving another for the same month replaces it (with its own reason in history).
7. When a month is split between owners, any leftover paisa goes to the owners with the largest remainders; ties go by display order.

### Balance and statement

8. Balance = sum of all the owner's entries, including voided originals and their reversals (which cancel each other).
9. Statement closing balance for "Latest" must always equal the balance on the owner card.
10. Entries are never deleted or edited; mistakes are fixed by Void (reversal) or Adjustment.
11. A negative balance is filled first by the owner's next entitlements.

### Payments and advances

12. A payout can never be more than the owner's positive balance; the excess must be recorded as an advance or a loan.
13. Paying when the balance is zero or negative is only possible as an advance or loan.
14. Payments and advances are posted in the latest open month; with no open month they are not possible.
15. Bank, bKash and Nagad payments need a reference number; cash doesn't.
16. Advances above the advance limit are allowed but flagged.
17. Only payouts and advances can be voided, only once, with a reason.

### Owners

18. Owners are never deleted. An owner with 0 units is a Former owner.
19. An owner may exist without a login. One login can be linked to only one owner.
20. Contact details are visible only to logged-in members; an owner can hide their phone.

### Language and money display

21. Amounts show as ৳ with lakh grouping (৳1,45,000); Bangla digits in Bangla (৳১,৪৫,০০০); paisa only when not zero.
22. Colour is always paired with a word (Owed, Advance outstanding, Settled).

---

## 8. Messages, Warnings & Empty States

| Situation | Message |
| --- | --- |
| Share change without reason | "A reason is required for every share change." |
| All units are 0 | "Total share units must be above zero." |
| Effective month is closed | "That month is closed. Pick an open month or a later one." |
| Pay with no open month | "Open a month first — payments are recorded in an open month." |
| Pay more than balance | "৳X more than {Name}'s balance — choose whether the excess is an advance or a loan." |
| Pay more than House Fund | "This is more than the House Fund holds (৳X)." (warning) |
| Pay when nothing is owed | "Nothing is owed — anything you pay becomes an advance or loan." |
| Advance over limit | "Above the advance limit — allowed, but flagged." |
| Missing reference no. | "Add the bKash TrxID, Nagad TrxID or cheque number." |
| Void without reason | "Please write a reason — everyone can see it." |
| Void done | "Reversal posted · balance and fund restored" |
| Payment done | "Payment of ৳X recorded for {Name}" |
| Share set saved | "Share set saved · effective {Month}" |
| Empty statement range | "No entries between {From} and {To}." |
| No owners yet (setup) | "No owners yet. Add the first owner, then give everyone their shares." + **Add owner** |
| No former owners | Link is hidden |

---

## 9. Notifications

| Event | Who is told | Phase |
| --- | --- | --- |
| Payment recorded | That owner (email + receipt PDF, can opt out) | P2 |
| Advance recorded | All owners (who, how much, reason) | P2 |
| Self-advance by the Super Admin | All owners, tagged "Self" | P2 |
| Payout or advance voided | That owner (with the reason) | P2 |
| Share set changed | All owners (before → after, effective month, reason) | P2 |
| Balance adjustment | That owner | P2 |
| Monthly report (own balance, entitlement, received) | All owners | P2 (Reports) |

Emails never include bank account numbers or other owners' phone numbers.

---

## 10. Worked Example

Nasrin Ahmed (40% from June 2026), statement **August 2026 → Latest** from the design's sample data:

| Date | Month | Type | Note | Amount | Running balance |
| --- | --- | --- | --- | --- | --- |
| | | | **Brought forward** | | ৳29,894.40 |
| 5 Aug | Aug | Payout | For July 2026 | −৳29,894.40 | ৳0 |
| 31 Aug | Aug | Entitlement | Share of August 2026 | +৳34,777.60 | ৳34,777.60 |
| 5 Sep | Sep | Payout | For August 2026 | −৳34,777.60 | ৳0 |
| 30 Sep | Sep | Entitlement | Share of September 2026 | +৳34,815.60 | ৳34,815.60 |
| 5 Oct | Oct | Payout | For September 2026 | −৳34,815.60 | ৳0 |
| 12 Oct | Oct | Advance | Advance · eye check-up | −৳5,000 | −৳5,000 |
| | | | **Closing balance** | | **−৳5,000 (Advance outstanding)** |

When October closes, her October entitlement (preview ৳33,827.60) first fills the −৳5,000, leaving ৳28,827.60 owed.

---

## 11. Acceptance Criteria

### Owner list and detail
- [ ] Every current owner appears once, in display order, with correct %, units, balance label/colour and loan
- [ ] The viewer's card is tagged **You**; Super Admin and Invite pending tags are correct
- [ ] Owner detail summary matches the statement (balance = Latest closing balance)
- [ ] "Paid out" excludes voided payments
- [ ] Former owners appear only in the Former owners list

### Statement
- [ ] Brought forward + all rows = Closing balance for any range
- [ ] Voided rows stay visible and struck through; their reversal cancels them
- [ ] PDF matches the screen exactly, in the viewer's language
- [ ] Owners can open and download any owner's statement

### Shares
- [ ] A share change without a reason can't be saved
- [ ] A closed month can't be chosen as the effective month
- [ ] After a share change, closed months' entitlements don't change
- [ ] Share history and the house share timeline show every change with reason and who made it

### Payments, advances, voids, adjustments
- [ ] Paying the full balance makes the owner Settled
- [ ] Paying more than the balance always asks advance or loan and records two entries
- [ ] Advance needs a reason; over-limit advances are flagged, not blocked
- [ ] Voiding a payout restores the balance and House Fund exactly
- [ ] An entry can't be voided twice; entitlements can't be voided here
- [ ] No payment, advance or adjustment can be recorded without an open month
- [ ] An Owner (non-admin) sees no Pay, Advance, Void, Change shares, Add owner or Edit buttons, and is refused if they try

### General
- [ ] Every action above appears in the Audit Log with who, when, before → after and reason
- [ ] All screens work at 360px width, in বাংলা and English

---

## 12. Release Phases

| Phase | Features |
| --- | --- |
| **P1 — MVP** | F1 Owner list · F2 Owner detail · F3 Statement · F4 Statement PDF · F5 Share history · F6 Change shares · F7 Add owner · F8 Edit owner · F9 Former owners · F10 Opening balances · F11 Pay · F12 Advance · F13 Void · F14 Adjustment · F17 Own shortcuts |
| **P2** | F15 Payment receipt & email · all notifications in section 9 · hide-phone setting |
| **P3** | F16 "I received it" confirmation · per-owner bank/bKash details for faster payments · multi-house owner view |

---

## 13. Open Questions

- [ ] Should owners see each other's phone numbers by default, or only their own?
- [ ] Do share changes need approval from the owners affected (e.g. both giver and receiver confirm)?
- [ ] For a deceased owner, should the estate keep receiving entitlements until heirs are confirmed, or should shares move immediately?
- [ ] Should "Paid out this year" include advances, or show them separately?
- [ ] Is the advance limit per owner or the same rule for everyone?
- [ ] Should a former owner with a remaining balance get a reminder until it is paid out?
- [ ] Should payments be allowed in whole taka only (leaving paisa in the balance)?