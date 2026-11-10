# BariHisab — Home Page PRD

> Version 1.0 · Nov 10, 2026 · Author: Rayhan (dev4@awfatech.com)
> Section: Home (the first screen after login — each person's own money picture, the house's month, and the bookkeeper's desk)
> Depends on: Authentication & roles, Income & Expenses, Owners, Distribution, Advances & Loans, Requests, Notices & Complaints, Settings

This document covers **features and behaviour only**. Technical design (database, API, code structure) is left to the implementation.

## Table of Contents

1. [Overview](#1-overview)
2. [Design Analysis](#2-design-analysis)
3. [Who Sees What](#3-who-sees-what)
4. [App Shell Around Home](#4-app-shell-around-home)
5. [Features](#5-features)
6. [User Flows](#6-user-flows)
7. [Business Rules](#7-business-rules)
8. [Messages, Warnings & Empty States](#8-messages-warnings--empty-states)
9. [Worked Example](#9-worked-example)
10. [Acceptance Criteria](#10-acceptance-criteria)
11. [Release Phases](#11-release-phases)
12. [Open Questions](#12-open-questions)

---

## 1. Overview

Home answers, in one screen and without scrolling far:

- **For every owner:** "What is my balance, what's coming to me this month, what did I get, and what's happening in the house?"
- **For the Super Admin (bookkeeper):** all of the above, plus "Is the money in the bank matching the books, and what needs my action today?"

Home is a summary. Every block links to the section where the detail lives; nothing is edited on Home itself except shortcuts that open the usual forms.

### Goals

- An owner understands where they stand within 5 seconds of logging in.
- The bookkeeper sees every pending job (requests, complaints, unpaid rent, month to close, fund mismatch) without opening other pages.
- Home never shows a number that disagrees with the detailed pages.

### In scope

- Greeting header and quick actions
- Personal balance hero and this month's personal figures
- "The house this month" staircase
- Latest activity
- Pinned notices
- Bookkeeper's desk (House Fund, Reconciliation, Pending requests, Open complaints, Invites waiting)
- Reminders (rent status, close-the-month)
- My open request status
- Empty, first-run and error states
- Mobile and desktop layouts

### Out of scope

- The login page and invite flow (Authentication)
- Editing anything in place (all edits open the relevant section's form)
- Charts and yearly figures (Reports)

### Success metrics

| Metric | Target |
| --- | --- |
| Owners who log in at least once a month | ≥ 80% |
| Home loads on 4G mobile | < 3 seconds |
| Super Admin actions started from Home (requests, close month, entries) | ≥ 60% of those actions |
| Numbers on Home that differ from the detail pages | 0 |
| Fund mismatches noticed the same day | 100% (shown on Home) |

---

## 2. Design Analysis

What the BariHisab design shows for Home (screen S2), and what it leaves open.

### 2.1 What the design shows

**Header**

- Kicker: "{House name} · {month}" (e.g. "Ahmed Villa · October 2026").
- Title: "Hello, {first name}" / "স্বাগতম, {first name}".
- Super Admin buttons on the right: **Generate this month's rent** · **+ Income** · **+ Expense** (primary).

**Balance hero** (left half, under a 2px ink rule)

- Kicker "Your current balance".
- Amount in very large type, coloured: green when owed, red when advance outstanding, ink when zero.
- Tag **Owed** / **Advance outstanding** / **Settled** + "Share {%}".
- One plain sentence:
  - Owed: "The house owes you this. Pay-outs follow the month close."
  - Advance: "You have taken more than your entitlement. Your next entitlement fills this first."
  - Zero: "Nothing is owed either way."
- Link **My statement →** (opens the viewer's owner page).

**This month's figures** (right half, three stacked rows)

- "Entitlement · {month} (preview)" — the viewer's share of the open month.
- "Received this month" — payouts to the viewer this month.
- "Loan outstanding" — or "None".

**Bookkeeper's desk** (Super Admin only, kicker "Super Admin only")

| Tile | Content |
| --- | --- |
| House fund | Total, then each account ("Cash — with Rayhan", "DBBL savings ·· 4471") with its balance |
| Reconciliation | ✓ **Balanced** (green) "Fund matches the ledgers to the paisa" or ⚠ **Check** (red) "Mismatch of ৳X"; small formula line "Fund = owner balances + reserve + open month − deficit − loans" |
| Pending requests | Big count in a yellow box → "Review queue →" |
| Open complaints | Big count → "Notices & complaints →" |

**Close-the-month reminder** (Super Admin, surface strip with a yellow top rule)

"Close-the-month reminder. {Month} is open. {Unit} ({tenant}) has not paid rent yet." + **Review distribution**.

**The house this month**

- Title with a **Draft** tag while the month is open.
- Staircase: **Income** · **− Expense** · **− Reserve** · **− Previous deficit** · yellow **Distributable =**.
- Link **Every owner's share →** (Distribution).

**Latest activity**

- Last 6 money events (income, expenses, payouts, advances): date · title · sub-line · signed amount (green for money in).
- Title "Latest activity" / "সাম্প্রতিক লেনদেন".

**Pinned notices**

- Pin icon in the title; each: **Urgent** yellow tag if urgent, date, title, body.

**App shell**

- Desktop: left sidebar (logo, house, menu with badges, user + logout); top bar with month picker, language toggle, primary action (**+ New entry** for Super Admin, **+ Request money** for Owner).
- Mobile: bottom nav — Super Admin: Home · Entries · [+] · Distribution · More; Owner: Home · Accounts · Requests · Notices · More.
- Prototype only: a "View as Admin / Owner" switch in the top bar.

### 2.2 Gaps found and decisions

| # | Gap in the design | Decision |
| --- | --- | --- |
| G1 | Home always shows the latest open month, but the top bar's month picker is still visible and seems to do nothing | Home shows the **current month** (latest open month) only; the month picker is hidden on Home and the kicker names the month |
| G2 | A Super Admin who is not an owner would see an empty balance hero | Hide the hero and personal figures for non-owners; the desk moves to the top |
| G3 | "Received this month" ignores advances | Show **Received** (payouts) and, when there are any, a second line **Advances** |
| G4 | The close-month reminder shows any time a month is open, even on day 1 | Two strips: **Rent status** (from the 10th, while units are unpaid) and **Close-the-month** (from the 1st of the next month while the old month is open) |
| G5 | Latest activity has no way to see more | **See all →** links to Income & Expenses; payouts and advances link to the owner's statement |
| G6 | Long notice bodies can push the page down | Body clamped to 3 lines with **Read more**; unread notices get a dot |
| G7 | No first-run or empty states | Defined in section 8 (no owners, no open month, first month, no activity, no notices) |
| G8 | "Check" in Reconciliation gives no way to investigate | **See details** opens a breakdown of the formula with each part's value |
| G9 | Invites not accepted yet aren't visible on Home | Desk tile **Invites waiting** (count, expired ones flagged) → Users |
| G10 | Email failures aren't shown anywhere (main PRD requires it) | P2 desk warning "{n} emails failed to send" → Settings › Email log |
| G11 | An owner can't see their open request on Home | **My request** strip when they have a Pending or Approved request |
| G12 | The "View as" switch is a prototype tool | Not in the product; a Super Admin who is also an owner simply sees both their owner view and the desk |
| G13 | No sign of when figures were last updated | Figures update right after any action; on mobile, pull down to refresh; "Updated just now" note after refresh |
| G14 | Hero sentence doesn't mention a loan | When a loan is active, add "Loan {no.}: ৳X left, next deduction ৳Y on {month} close." |

---

## 3. Who Sees What

| Block | Owner | Super Admin who is an owner | Super Admin not an owner |
| --- | --- | --- | --- |
| Header + greeting | ✓ | ✓ | ✓ |
| Quick actions (rent, income, expense) | ✗ | ✓ | ✓ |
| **+ Request money** shortcut | ✓ | ✓ (in top bar) | ✗ |
| Balance hero | ✓ | ✓ | ✗ |
| This month's personal figures | ✓ | ✓ | ✗ |
| My request strip | ✓ | ✓ | ✗ |
| Bookkeeper's desk | ✗ | ✓ | ✓ |
| Rent status / Close-the-month reminders | ✗ | ✓ | ✓ |
| The house this month | ✓ | ✓ | ✓ |
| Latest activity | ✓ | ✓ | ✓ |
| Pinned notices | ✓ | ✓ | ✓ |

Everyone sees the same house figures (transparency). Only the desk, reminders and quick actions are for the Super Admin.

---

## 4. App Shell Around Home

Home sits inside the app shell shared by every page. Features of the shell that matter for Home:

### Desktop (860px and wider)

- **Sidebar** (left): yellow square logo + "BariHisab", "{House} · {area}", menu (Home first), badges (yellow, square) for pending requests and unread notices, bottom: avatar, name, role, **Log out**.
- **Top bar**: language toggle (বাংলা / English), primary action (**+ New entry** for Super Admin, **+ Request money** for Owner). Month picker hidden on Home (G1).

### Mobile (below 860px)

- **Top bar**: logo, language toggle.
- **Bottom nav** (5 items, active item with a yellow top bar):
  - Super Admin: Home · Entries · **[+]** (yellow, opens + Expense) · Distribution · More
  - Owner: Home · Accounts (Reports) · Requests · Notices · More
- **More** sheet lists the remaining sections and **Log out**.

### Language

- Bangla is the default; the toggle switches every label, month name and digit immediately and remembers the choice in the profile.

---

## 5. Features

### F1 · Greeting header — P1

- Kicker "{House name} · {current month}".
- "Hello, {first name}" / "স্বাগতম, {first name}".
- Super Admin quick actions (only when a month is open): **Generate this month's rent** (hidden when every unit has rent), **+ Income**, **+ Expense** (primary). Each opens the Income & Expenses form/dialog over Home; Home updates after saving.
- With no open month, the buttons are replaced by "No open month" and a link to Distribution.

### F2 · Balance hero — P1 (owners)

- Kicker "Your current balance".
- Amount (very large), colour and tag by sign: **Owed** (green) / **Advance outstanding** (red) / **Settled** (ink).
- "Share {%}" next to the tag.
- Explanation sentence (2.1), plus a loan line when the viewer has an active loan (G14).
- **My statement →** opens the viewer's owner page.
- The amount here always equals the balance on the Owners page and the statement's latest closing balance.

### F3 · This month for me — P1 (owners)

Three to four rows next to the hero:

1. **Entitlement · {month} (preview)** — the viewer's share of the current open month's distributable; "(preview)" until the month closes.
2. **Received this month** — payouts to the viewer posted this month.
3. **Advances this month** — only when there are any.
4. **Loan outstanding** — total left on the viewer's loans, or "None".

Tapping a row opens the related page (Distribution, statement, Advances & Loans).

### F4 · My request strip — P1 (owners)

- Shown when the viewer has a request that is **Pending** or **Approved · awaiting cash**.
- "Your {type} request for ৳X is {status}." (+ "Approved ৳Y" when lower) → **View request**.
- Rejected or disbursed requests show once (until opened) as "Your request was {rejected / paid out} · View".

### F5 · Bookkeeper's desk — P1 (Super Admin)

Ruled section titled "Bookkeeper's desk" with the note "Super Admin only". Tiles in a grid (4 across on desktop, 2 on tablets, 1 on phones):

| Tile | Behaviour |
| --- | --- |
| **House fund** | Total and each active fund account with its balance → Settings › Fund accounts |
| **Reconciliation** | **Balanced** (green tick) or **Check** (red alert) with the mismatch; the formula in small text; **See details** opens the breakdown (G8) |
| **Pending requests** | Count in a yellow box (plain when 0) → Requests "Needs your decision" |
| **Open complaints** | Count of Open + In review → Notices & Complaints |
| **Invites waiting** (G9) | Count of users who haven't set a password; "{n} expired" in red → Users |
| **Email problems** (P2, G10) | Shown only when emails failed: "{n} emails failed" → Email log |

### F6 · Reminders — P1 (Super Admin)

Shown under the desk as surface strips with a yellow top rule, red alert icon, text and one button. At most two at once, most urgent first.

| Reminder | When it shows | Text | Button |
| --- | --- | --- | --- |
| **Close-the-month** | From the 1st of the next month while an older month is still open | "Close-the-month reminder. {Month} is open." + unpaid units if any | **Review distribution** |
| **Rent status** | From the 10th of the current month while units have no rent | "{n} unit(s) haven't paid rent: Flat 3A (Nusrat Jahan)." | **Generate rent** |
| **Approved, not paid** | An approved request is past its needed-by date | "{Owner}'s ৳X {type} was due on {date}." | **Disburse** |

Each strip can be hidden for the day (**Hide today**); it comes back the next day if still true.

### F7 · The house this month — P1

- Title "The house this month" + **Draft** tag while open.
- The same staircase as Distribution: Income · − Expense · − Reserve · − Previous deficit · **Distributable =** (yellow).
- Red note when a deficit is building: "Expenses are higher than income so far — ৳X short."
- **Every owner's share →** opens Distribution for this month.
- Each cell opens the matching detail (Income tab, Expense tab, Distribution).

### F8 · Latest activity — P1

- Last 6 money events across the house, newest first: income, expenses, payouts, advances, loans, loan repayments.
- Row: date · title (category, or "Payout · {Owner}") · sub-line (description, or method · reference no.) · signed amount (green for money in, ink for money out).
- Voided items don't appear.
- Tap a row → the entry's detail (Income & Expenses) or the owner's statement row.
- **See all →** opens Income & Expenses for the current month.
- Empty: "Nothing recorded yet this month."

### F9 · Pinned notices — P1

- Title "Pinned notices" with a pin icon; newest first; up to 3, then **All notices →**.
- Each: **Urgent** tag (yellow) when urgent, date, title (bold), body clamped to 3 lines with **Read more**, an unread dot until opened.
- Empty: "No pinned notices."

### F10 · Layout & responsiveness — P1

- **Desktop** order: header → hero + this month (two columns) → desk → reminders → house this month → activity and notices side by side.
- **Mobile** order: header → hero → this month → my request strip → reminders (Super Admin) → desk → house this month → notices → activity.
- Design system rules: ink on paper, one yellow signal, zero radius, 2px rules between sections, money in heavy tabular numbers, 44px touch targets, at least 360px wide with no sideways scrolling.

### F11 · Freshness & loading — P1

- Home shows skeleton blocks while loading; each block loads independently, so one slow block doesn't hold the page.
- After any action started from Home (entry saved, request approved, month closed), the affected blocks update at once.
- Mobile: pull down to refresh; desktop: refresh on returning to the tab after 5 minutes.
- If a block fails to load: "Couldn't load {block}. Try again" with a retry button; the rest of Home still works.

### F12 · First-run states — P1

| Situation | What Home shows |
| --- | --- |
| Super Admin, setup not finished | Setup checklist: House info · Fund accounts · Owners & shares · Opening balances · First month · Invite owners — each with a ✓ or a **Continue** button |
| No open month | "No open month" in the header; staircase hidden; desk still shown |
| First month (nothing closed yet) | Balance hero shows opening balances; a note "Your first entitlement arrives when {month} closes." |
| Owner without shares this month | Hero shows balance; "You have no share this month" instead of entitlement |

---

## 6. User Flows

### 6.1 Owner's monthly check

1. Nasrin logs in → Home.
2. Hero: **−৳5,000 · Advance outstanding · Share 40%** — "You have taken more than your entitlement. Your next entitlement fills this first."
3. This month: Entitlement (preview) ৳33,827.60 · Received ৳34,815.60 · Advances ৳5,000 · Loan None.
4. Glances at the staircase (Distributable ৳84,569) and the pinned "Water tank cleaning" notice.
5. Taps **My statement →** to see details.

### 6.2 Bookkeeper's morning

1. Rayhan logs in → Home: hero **Settled**, desk shows House fund ৳1,24,508.75, **Balanced**, **1** pending request, **2** open complaints.
2. Rent status strip: "1 unit hasn't paid rent: Flat 3A (Nusrat Jahan)."
3. Taps **Pending requests** → decides Nasrin's request → returns to Home; count is now 0.
4. Taps **+ Expense** → records the gas bill → Latest activity and the staircase update.

### 6.3 Month-end

1. On 1 November, Home shows "Close-the-month reminder. October 2026 is open."
2. **Review distribution** → close October.
3. Back on Home: header shows November; owners' heroes include October's entitlement.

### 6.4 Something is wrong with the fund

1. Desk shows **Check · Mismatch of ৳2,000**.
2. **See details** → breakdown shows the cash account is ৳2,000 off.
3. Super Admin finds an unrecorded fund transfer and records it → Reconciliation returns to **Balanced**.

---

## 7. Business Rules

1. Home always shows the **current month** = the latest open month; if none is open, the latest closed month with a "No open month" note.
2. Every figure on Home comes from the same rules as its detail page and must match it exactly.
3. Balance colour and label: positive → green **Owed**; negative → red **Advance outstanding**; zero → ink **Settled**. Colour never appears without the word.
4. "(preview)" is shown on entitlement and Draft on the staircase until the month closes.
5. Latest activity excludes voided entries and shows at most 6 items.
6. Owners see all house figures, all owners' payouts and advances in Latest activity, and pinned notices; they never see the desk, reminders or quick actions.
7. Quick actions appear only for the Super Admin and only when a month is open.
8. Reconciliation is **Balanced** only when the House Fund equals owner balances + reserve + open month net − deficit carried − loans outstanding, to the paisa.
9. Reminders follow the timing in F6; hidden reminders return the next day if still true.
10. Pending counts and badges always match the lists they open.
11. Money shows as ৳ with lakh grouping (৳1,24,508.75); Bangla digits in Bangla; paisa only when not zero.
12. Home never edits data in place; every change goes through the section's normal form and permission check.

---

## 8. Messages, Warnings & Empty States

| Situation | Message |
| --- | --- |
| Balance owed | "The house owes you this. Pay-outs follow the month close." |
| Advance outstanding | "You have taken more than your entitlement. Your next entitlement fills this first." |
| Settled | "Nothing is owed either way." |
| Active loan | "Loan {no.}: ৳X left, next deduction ৳Y on {month} close." |
| First month | "Your first entitlement arrives when {month} closes." |
| No share this month | "You have no share this month." |
| No open month (Super Admin) | "No open month — open one from Distribution." |
| Reconciliation OK | "Balanced · Fund matches the ledgers to the paisa" |
| Reconciliation mismatch | "Check · Mismatch of ৳X" + **See details** |
| No pending requests | Count "0" without the yellow box |
| Deficit building | "Expenses are higher than income so far — ৳X short." |
| No activity | "Nothing recorded yet this month." |
| No pinned notices | "No pinned notices." |
| Block failed | "Couldn't load {block}. Try again" |
| Expired invites | "{n} invite(s) expired" (red) |
| Emails failed (P2) | "{n} emails failed to send" |

---

## 9. Worked Example

Home on 22 October 2026 from the design's sample data.

### Rayhan (Super Admin and 25% owner)

| Block | Shows |
| --- | --- |
| Header | "Ahmed Villa · October 2026" · "Hello, Rayhan" · Generate this month's rent · + Income · + Expense |
| Hero | ৳0 · **Settled** · Share 25% · "Nothing is owed either way." |
| This month | Entitlement (preview) ৳21,142.25 · Received ৳21,759.75 · Loan None |
| House fund | ৳1,24,508.75 — Cash — with Rayhan ৳31,000 · DBBL savings ·· 4471 ৳93,508.75 |
| Reconciliation | **Balanced** |
| Pending requests | **1** (Nasrin's ৳10,000 advance) |
| Open complaints | **2** |
| Reminder | "1 unit hasn't paid rent: Flat 3A (Nusrat Jahan)." |
| House this month | Income ৳1,03,000 − Expense ৳13,980 − Reserve ৳4,451 − Previous deficit ৳0 = **৳84,569** (Draft) |

### Latest activity (everyone)

| Date | Item | Detail | Amount |
| --- | --- | --- | --- |
| 20 Oct | Cleaning & maintenance | Stairs, roof & drain cleaning | −৳3,000 |
| 15 Oct | Gas | Caretaker room · 2 burners | −৳1,080 |
| 14 Oct | Water | Monthly water bill | −৳3,600 |
| 12 Oct | Advance · Nasrin Ahmed | Bank · TX4134 | −৳5,000 |
| 12 Oct | Electricity | Common meter · stairs, pump, gate | −৳6,300 |
| 10 Oct | Other income | Rooftop tower lease | +৳15,000 |

### Nasrin (Owner, 40%)

Hero −৳5,000 **Advance outstanding**; this month: Entitlement (preview) ৳33,827.60 · Received ৳34,815.60 · Advances ৳5,000 · Loan None; My request strip "Your advance request for ৳10,000 is pending." No desk, no quick actions.

---

## 10. Acceptance Criteria

### Owner view
- [ ] Hero amount, label and colour match the owner's statement balance
- [ ] Entitlement preview matches the owner's row on Distribution for the current month
- [ ] Received and Advances this month match the statement for that month
- [ ] Loan outstanding matches Advances & Loans
- [ ] My request strip appears only for Pending/Approved requests and links to the request
- [ ] No desk, reminders or quick actions are shown

### Super Admin view
- [ ] Quick actions open the right forms and Home updates after saving
- [ ] House fund total equals the sum of active fund accounts
- [ ] Reconciliation shows Balanced only when the formula matches to the paisa; See details shows each part
- [ ] Pending requests, open complaints and invites waiting counts match their pages
- [ ] Reminders follow the timing rules and can be hidden for the day
- [ ] A Super Admin who isn't an owner sees no hero and no empty personal blocks

### Everyone
- [ ] Staircase matches Distribution for the current month; Draft tag while open
- [ ] Latest activity shows the 6 newest non-voided money events, linked to their details
- [ ] Pinned notices show up to 3 with urgent tags and unread dots
- [ ] Home shows the latest open month and no month picker
- [ ] Each block loads and fails independently; skeletons while loading
- [ ] Works at 360px width without sideways scrolling, in বাংলা and English
- [ ] First load under 3 seconds on 4G

---

## 11. Release Phases

| Phase | Features |
| --- | --- |
| **P1 — MVP** | F1 Greeting header · F2 Balance hero · F3 This month for me · F4 My request strip · F5 Bookkeeper's desk (fund, reconciliation, requests, complaints, invites) · F6 Reminders · F7 House this month · F8 Latest activity · F9 Pinned notices · F10 Layout · F11 Freshness & loading · F12 First-run states |
| **P2** | Email problems tile · reminder emails (from Distribution and Requests) · reconciliation with real cash/bank balance entered at month end (variance shown) |
| **P3** | Small trend sparkline for the house distributable (last 6 months) · birthday greeting · installable app (PWA) home-screen shortcut |

---

## 12. Open Questions

- [ ] Should owners also see the House Fund total (more transparency), or keep it for the Super Admin only?
- [ ] Should Latest activity show other owners' payouts and advances to every owner, or only house income/expenses?
- [ ] Should Home let the viewer switch to a previous month, or always stay on the current month (this PRD)?
- [ ] Is the 10th the right day to start the rent status reminder?
- [ ] Should pinned notices on Home be limited to Urgent ones only?
- [ ] Do we want a short "what changed since your last visit" line for owners (e.g. "October closed · +৳33,827.60")?