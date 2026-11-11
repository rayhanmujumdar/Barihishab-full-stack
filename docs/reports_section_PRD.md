# BariHisab — Reports Page PRD

> Version 1.0 · Nov 10, 2026 · Author: Rayhan (dev4@awfatech.com)
> Section: Reports (monthly report, yearly report, print and PDF, plus Phase 2 reports: rent roll, expense analysis, fund accounts, archive)
> Depends on: Income & Expenses, Distribution (month status and snapshots), Owners (balances, statements), Advances & Loans, Settings

This document covers **features and behaviour only**. Technical design (database, API, code structure) is left to the implementation.

## Table of Contents

1. [Overview](#1-overview)
2. [Design Analysis](#2-design-analysis)
3. [Key Concepts](#3-key-concepts)
4. [Who Can Do What](#4-who-can-do-what)
5. [Features](#5-features)
6. [User Flows](#6-user-flows)
7. [Report Rules](#7-report-rules)
8. [Messages, Warnings & Empty States](#8-messages-warnings--empty-states)
9. [Worked Examples](#9-worked-examples)
10. [Acceptance Criteria](#10-acceptance-criteria)
11. [Release Phases](#11-release-phases)
12. [Open Questions](#12-open-questions)

---

## 1. Overview

Reports turn the house's books into documents a family can read, print, keep and discuss. In the design the page is called **Reports** for the Super Admin and **Accounts** (হিসাব) in the owner's bottom bar. It answers:

- **Monthly:** "Where did this month's money come from, where did it go, and what did each owner get?"
- **Yearly:** "How did the year go month by month, and how much did each owner earn and receive?"

Reports never change data. They read what the other sections recorded and present it the same way on screen, on paper and in PDF.

### Goals

- Any owner can produce an official-looking monthly or yearly report in two taps.
- On-screen figures, printouts and PDFs are always identical.
- A draft (open) month can never be mistaken for a final one.
- The family can see trends (big repairs, rising bills) without a spreadsheet.

### In scope

- Monthly report (income, expenses by category and detail, staircase, owner table)
- Yearly report (totals, month-by-month chart, 12-month table, owner year summary)
- Draft labelling for open months
- Print and PDF download
- Report period pickers
- Phase 2: CSV export, rent roll, expense analysis over a range, fund accounts report, comparisons, archived monthly PDFs
- Phase 3: Excel export

### Out of scope

- Owner statement (lives in Owners — Reports links to it)
- Emails themselves (the monthly email reuses the monthly report's content; sending rules are in Notifications)
- Editing any figure

### Success metrics

| Metric | Target |
| --- | --- |
| On-screen vs PDF/print differences | 0 |
| Monthly PDF generated | < 5 seconds |
| Yearly report shown | < 2 seconds |
| Owners who open at least one report per quarter | ≥ 70% |
| Draft reports shared as if final (complaints) | 0 |

---

## 2. Design Analysis

What the BariHisab design shows for Reports (screen S9), and what it leaves open.

### 2.1 What the design shows

**Header**

- Kicker = house name; title "Reports".
- Tabs **Monthly** · **Yearly** (selected = ink fill).
- Buttons **Print** and **PDF** (everyone).
- The top-bar month picker chooses the month (Monthly) and the year (Yearly).

**Monthly report**

- Title "Monthly report · {Month}" + yellow **Draft — not closed yet** tag for an open month.
- Two columns:
  - **Income** with the total on the right, then one row per category: "{Category} · {count}" and amount, with a horizontal bar (longest = 100%).
  - **Expense by category** with the total, same row style, sorted by amount.
- Staircase strip: Income · − Expense · − Reserve · − Previous deficit · yellow **= Distributable**.
- Owner table: Owner · Share · Entitlement · Received · Advance · Balance · Loan.

**Yearly report**

- Title "Yearly report · {year}" and the note "Open months are drafts".
- Three totals: **Income**, **Expense**, **Distributable** (yellow).
- Bar chart: 12 months, two bars each — Income (ink) and Expenses (yellow) — with a legend and a 2px baseline; open months shown as drafts.
- 12-month table: rows Income, Expenses, Reserve, **Distributable**; a column per month (draft months marked) and **Total**.
- Owner year table: "Owner · {year}" · Share now · Entitlement · Paid out · Loan deductions · Balance now.

**Main PRD requirements this page must meet**

- RPT-01 Monthly report incl. expense detail; RPT-02 Yearly report; RPT-03 Owner statement; RPT-04 "Draft — not final" label; RPT-05 PDF (P2) and Excel (P3).

### 2.2 Gaps found and decisions

| # | Gap in the design | Decision |
| --- | --- | --- |
| G1 | "Expense" means different things in different places: the monthly expense total and the yearly chart include Reserve-paid expenses, but the staircase and the yearly Expenses row exclude them | Everywhere: **Expenses (all)** includes Reserve-paid ones; a line "of which paid from Reserve ৳X" sits under it; the staircase and distributable use **Expenses counted** (excluding Reserve-paid). Labels say which is which |
| G2 | Yearly totals add the open month's draft numbers into the year total | Yearly totals show **closed months** as the main figure and "+ ৳X draft ({Month})" next to it |
| G3 | Yearly report takes its year from the month picker | Own **Year** picker on the Yearly tab (years with data only) |
| G4 | Monthly report shows categories but not the entries (RPT-01 asks for detail) | Each category row expands to its entries (date, description, vendor, amount, 📎); the PDF adds an "Entries" appendix |
| G5 | Category bars have no % | Show "{amount} · {% of total}" |
| G6 | Print and PDF behaviour isn't defined | Defined in F5/F6: layout, header, footer, draft watermark, file name, language |
| G7 | Owner tables have no totals row | Add totals (Σ entitlement = distributable) |
| G8 | Yearly owner table shows "Share now", which misleads when shares changed during the year | Show share now + a note "changed in June" with the before/after; entitlement is always calculated with each month's own shares |
| G9 | No comparison with earlier periods | P2: monthly "vs last month" and "vs same month last year" for income, expense and distributable |
| G10 | No rent collection view (which unit paid which month) | P2: **Rent roll** report (unit × month grid) |
| G11 | No view of cash vs bank | P2: **Fund accounts** report (opening, in, out, transfers, closing per account per month) |
| G12 | No custom range or category analysis | P2: **Expense analysis** over any range, by category and vendor |
| G13 | Owner statement isn't reachable from Reports | **Owner statements** link list at the bottom of Monthly and Yearly |
| G14 | A month with no data shows empty columns | Show "—" and "No entries in {Month}" |
| G15 | Closed months' reports aren't kept as they were at close | P2: PDF **archived automatically** on close (and on each re-close), listed under **Archive** |
| G16 | Owners' bottom-bar label is "Accounts" while the page title is "Reports" | Page title "Reports" (রিপোর্ট); owner nav label "Accounts" (হিসাব) kept as a friendly alias |

---

## 3. Key Concepts

### Final vs draft
A report for a **closed** month is **final**: it uses the snapshot taken at close and never changes (unless the month is reopened). A report for an **open** month is a **draft**: it is live and can change. Drafts are always labelled.

### Expenses (all) vs Expenses counted
- **Expenses (all)** = every non-voided expense in the period.
- **Paid from Reserve** = the part paid out of the saved Reserve.
- **Expenses counted** = Expenses (all) − Paid from Reserve. Only this reduces the distributable.

### Entitlement vs paid out
Entitlement is what an owner earned from closed months; paid out is what the house actually gave them (payouts + advances). The difference, plus opening balances, loan deductions and adjustments, is their balance.

### Period
Reports run on calendar months (Asia/Dhaka) and calendar years. Income and expenses belong to the month they were booked to, not the day the cash moved.

---

## 4. Who Can Do What

| Feature | Super Admin | Owner |
| --- | --- | --- |
| View monthly and yearly reports for any month/year | ✓ | ✓ |
| See every owner's figures in reports | ✓ | ✓ |
| Expand categories to see entries and open bills | ✓ | ✓ |
| Print / download PDF | ✓ | ✓ |
| CSV export (P2) | ✓ | ✓ |
| Rent roll, expense analysis, fund accounts (P2) | ✓ | ✓ |
| Archive of closed-month PDFs (P2) | ✓ | ✓ |
| Regenerate an archived PDF (P2) | ✓ | ✗ |

Reports are read-only for everyone. Transparency rule: every owner sees the whole house's figures and every owner's line.

---

## 5. Features

### F1 · Reports page header — P1

- Kicker = house name; title "Reports".
- Tabs: **Monthly** · **Yearly** (P2 adds **Rent roll** · **Expenses** · **Fund accounts** · **Archive**, in a scrollable tab row on phones).
- Period picker for the active tab: month picker (Monthly), year picker (Yearly).
- Actions: **Print**, **PDF** (P2 adds **CSV**).
- The chosen tab and period are in the page link, so a link opens the same report.
- Default on opening: Monthly, **latest closed month** (the latest final report); the open month is one step forward in the picker.

### F2 · Monthly report — P1

Sections in order:

1. **Title** "Monthly report · {Month}" + status: **Final · closed {date}** or **Draft — not closed yet** (yellow).
2. **Summary line**: Income ৳X · Expenses ৳Y · Distributable ৳Z (and "Deficit ৳D carried" when it applies).
3. **Income by category**: total; per category "{name} · {n} entries", amount, % of total, bar. Rent can be expanded to show each unit.
4. **Expenses by category**: Expenses (all) total with "of which paid from Reserve ৳X"; per category name, count, amount, %, bar; sorted largest first.
5. **Expand a category** (tap) → its entries: date, description, vendor, amount, Reserve tag, attachment icon (opens the bill). Voided entries are not listed.
6. **Staircase**: Income · − Expenses counted · − Reserve · − Previous deficit · **= Distributable**; notes for deficit and Reserve-paid amounts (same wording as Distribution).
7. **Owner table**: Owner · Share (% and units) · Opening · Entitlement · Received · Advance · Loan ded. · Balance · Loan outstanding; totals row; balance coloured with its label.
8. **Notes** (only when relevant): "{Month} was reopened on {date}: {reason}", "Reserve overridden: {reason}", "{n} unit(s) didn't pay rent: …".
9. **Owner statements** links: one per owner → their statement for this month.

### F3 · Yearly report — P1

Sections in order:

1. **Title** "Yearly report · {year}" + "{n} months closed, {m} draft".
2. **Totals** (closed months): Income · Expenses (all) · Distributable (yellow), each with "+ ৳X draft" when an open month exists.
3. **Chart**: 12 months, Income (ink) and Expenses (yellow) bars side by side, months with no data left empty, draft months hatched or lighter with a "Draft" key; tap a month → its monthly report.
4. **Month table**: rows Income · Expenses (all) · of which from Reserve · Reserve kept · Deficit carried · **Distributable**; a column per month (draft marked) and **Total**.
5. **Top expense categories of the year**: top 5 with amounts and % (links to Expense analysis in P2).
6. **Owner year table**: Owner · Share now (+ "changed in {month}" note) · Opening (1 Jan) · Entitlement · Paid out · Advances · Loan deductions · Balance now · Loan outstanding; totals row.
7. **Owner statements** links for the year.

On phones, the month table and owner table scroll sideways with the first column fixed; the chart shows 12 thin bar pairs and month initials.

### F4 · Draft labelling — P1

- Draft months are labelled wherever they appear: tag on the monthly title, "Draft" on chart columns and table headers, "+ draft" next to yearly totals.
- Printed and PDF drafts carry a diagonal **DRAFT — NOT FINAL** watermark on every page and "Draft · may change" in the header.

### F5 · Print — P1

- **Print** opens the browser's print with a print layout: A4 portrait, black on white (yellow highlights become grey), no navigation, page breaks between sections, table headers repeated on each page.
- Header on each page: house name, address, report title and period, status (Final / Draft).
- Footer: "Generated by {Name} on {date, time} · BariHisab · page X of Y".

### F6 · PDF download — P1

- Same content and layout as Print, generated by the app and downloaded.
- Language = the viewer's current language (Bangla digits and month names in Bangla).
- Monthly PDF adds an **Entries** appendix: every income and expense of the month (date, category, description, vendor, fund account, amount).
- File names:
  - `BariHisab-Monthly-{YYYY-MM}.pdf` (`-DRAFT` added for open months)
  - `BariHisab-Yearly-{YYYY}.pdf`
- Shows "Preparing PDF…" with a spinner; fails with "Couldn't create the PDF. Try again."

### F7 · CSV export — P2

- From Monthly: all entries of the month (one row per entry). From Yearly: the month table and the owner year table.
- Amounts in taka with 2 decimals, English column names, dates as YYYY-MM-DD, a "Status" column (Final/Draft).

### F8 · Comparisons — P2

- Monthly: next to Income, Expenses and Distributable — "vs {last month}: +৳X (+Y%)" and "vs {same month last year}" when available; arrows with words, not colour alone.
- Category rows: small "▲ ৳X vs last month" when the change is above 20%.

### F9 · Rent roll — P2

- Grid: units down the side, months across (for the chosen year).
- Cell: rent amount (paid), **—** (not recorded), or "Arrear in {month}" when paid late in another month.
- Totals per month and per unit; "Expected" column from each unit's set rent; collection % per month.
- Tap a cell → the entry.

### F10 · Expense analysis — P2

- Choose a range (from month → to month) and optionally categories.
- Shows: total, by category (amount, %, entries), by vendor (top 10), monthly trend line per selected category, biggest single expenses (top 10).
- Example use: "How much did we spend on repairs in 2026?" → ৳1,75,700, of which ৳18,000 from Reserve.

### F11 · Fund accounts report — P2

- For a chosen month or year, per fund account: opening balance, income in, expenses out, payouts and advances out, loans out, loan cash repayments in, transfers in/out, closing balance.
- Closing balances must match Settings › Fund accounts and the Home House Fund total.

### F12 · Archive — P2

- When a month closes (and on every re-close), the final monthly PDF is saved automatically.
- **Archive** tab lists them: month, closed on, version (v1, v2 after a reopen), size, **Download**.
- Older versions stay; the latest is marked "Current".

### F13 · Excel export — P3

- Yearly workbook: sheets for Summary, Months, Owners, Income entries, Expense entries.

---

## 6. User Flows

### 6.1 Owner reads last month's report

1. Owner taps **Accounts** in the bottom bar → Reports opens on **Monthly · September 2026** (latest closed), tagged **Final**.
2. Sees income ৳1,25,000, expenses by category, distributable ৳87,039 and their own line.
3. Taps **Electricity** → sees the DESCO entry and opens the bill photo.
4. Taps **PDF** → `BariHisab-Monthly-2026-09.pdf` downloads.

### 6.2 Bookkeeper prepares for the family meeting

1. Super Admin opens **Yearly · 2026**.
2. Totals show 9 closed months plus October as draft.
3. Points to April in the chart (roof waterproofing) and the deficit carried into May.
4. **Print** → hands out copies; the October column is marked Draft.

### 6.3 Checking a draft month

1. Owner picks **October 2026** → yellow **Draft — not closed yet** tag.
2. Downloads the PDF → every page carries the **DRAFT — NOT FINAL** watermark.

### 6.4 Rent follow-up (P2)

1. Super Admin opens **Rent roll · 2026**.
2. Sees Flat 3A empty for October → follows up with the tenant.

---

## 7. Report Rules

1. Reports are read-only and use exactly the same calculation rules as Income & Expenses and Distribution.
2. Closed months use the snapshot taken at close; open months are live and always labelled Draft.
3. Voided entries never count and are not listed.
4. Expenses (all) includes Reserve-paid expenses; Expenses counted excludes them; every place says which one it shows.
5. Yearly totals separate closed months from the draft month.
6. Σ owner entitlements = distributable for every closed month and for the year's closed months.
7. Entitlements are always calculated with each month's own share set, never today's shares.
8. Screen, print, PDF and CSV show the same numbers for the same period.
9. Every owner can see every report, including every owner's line (transparency).
10. Money shows as ৳ with lakh grouping (৳12,28,000); Bangla digits in Bangla; paisa only when not zero.
11. Months and years follow Asia/Dhaka time.
12. Colour is never the only signal: drafts say "Draft", balances say Owed / Advance outstanding / Settled, comparisons have arrows and words.

---

## 8. Messages, Warnings & Empty States

| Situation | Message |
| --- | --- |
| Open month title | "Draft — not closed yet" |
| Closed month title | "Final · closed {date}" |
| Reopened month note | "{Month} was reopened on {date}: {reason}" |
| Draft PDF watermark | "DRAFT — NOT FINAL" |
| Yearly with a draft month | "{n} months closed, {m} draft" |
| Month with no entries | "No entries in {Month}." |
| Category with no entries | Not shown |
| Year with no data | "No data for {year} yet." |
| Reserve-paid expenses | "of which paid from Reserve ৳X" |
| Deficit | "Expenses exceeded income — a deficit of ৳X carries into {next month}." |
| PDF in progress | "Preparing PDF…" |
| PDF failed | "Couldn't create the PDF. Try again." |
| No archived PDFs (P2) | "Final PDFs are saved here automatically when a month closes." |

---

## 9. Worked Examples

All figures from the design's sample data (Ahmed Villa, 2026).

### 9.1 Monthly report · October 2026 (Draft)

| Income | Entries | Amount | % |
| --- | --- | --- | --- |
| House rent | 5 | ৳88,000 | 85% |
| Other income (rooftop tower lease) | 1 | ৳15,000 | 15% |
| **Total** | | **৳1,03,000** | |

| Expenses | Entries | Amount | % |
| --- | --- | --- | --- |
| Electricity | 1 | ৳6,300 | 45% |
| Water | 1 | ৳3,600 | 26% |
| Cleaning & maintenance | 1 | ৳3,000 | 21% |
| Gas | 1 | ৳1,080 | 8% |
| **Total** (none from Reserve) | | **৳13,980** | |

Staircase: ৳1,03,000 − ৳13,980 − Reserve ৳4,451 − ৳0 = **৳84,569** (Draft). Note: "1 unit didn't pay rent: Flat 3A."

### 9.2 Yearly report · 2026

| | Closed (Jan–Sep) | Draft (Oct) | All |
| --- | --- | --- | --- |
| Income | ৳11,25,000 | ৳1,03,000 | ৳12,28,000 |
| Expenses (all) | ৳4,54,220 | ৳13,980 | ৳4,68,200 |
| of which from Reserve | ৳18,000 (Jul, water pump) | ৳0 | ৳18,000 |
| Reserve kept | ৳36,729 | ৳4,451 | ৳41,180 |
| Distributable | ৳6,52,051 | ৳84,569 | ৳7,36,620 |

Top expense categories (all of 2026): Repairs ৳1,75,700 · Guard / salary ৳1,08,000 · Electricity ৳63,650 · Water ৳37,050 · Holding tax ৳37,000.

April shows Expenses ৳1,70,780 above Income ৳1,25,000 (roof waterproofing ৳1,45,000) → Distributable ৳0, deficit ৳45,780 carried into May.

### 9.3 Owner year table · 2026 (closed months)

| Owner | Share now | Opening 1 Jan | Entitlement | Paid out | Advances | Loan ded. | Balance now |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Nasrin Ahmed | 40% (50% until May) | ৳12,000 | ৳2,92,240.70 | ৳3,04,240.70 | ৳5,000 | — | −৳5,000 |
| Rayhan Ahmed | 25% | — | ৳1,63,012.75 | ৳1,63,012.75 | — | — | ৳0 |
| Tanvir Ahmed | 15% | −৳4,000 | ৳97,807.65 | ৳70,751.80 | — | ৳15,000 | ৳8,055.85 |
| Farzana Haque | 10% | — | ৳65,205.10 | ৳56,501.20 | — | — | ৳8,703.90 |
| Sabrina Ahmed | 10% (from June) | — | ৳33,784.80 | ৳33,784.80 | — | — | ৳0 |
| **Total** | 100% | | **৳6,52,051.00** | | | | |

Σ entitlement = closed-month distributable ৳6,52,051 ✓.

---

## 10. Acceptance Criteria

### Monthly
- [ ] Income and expense totals match Income & Expenses for the month (voided excluded)
- [ ] Expenses (all), "of which from Reserve" and the staircase's expense figure follow rule 4
- [ ] Category rows show count, amount, % and expand to their entries with bills
- [ ] Staircase and owner table match Distribution for the same month; totals row equals the distributable
- [ ] Closed months show Final with the close date; open months show the Draft tag

### Yearly
- [ ] Totals separate closed months from the draft month
- [ ] Chart and month table show all 12 months; empty months show "—"; draft months are marked
- [ ] Owner year table: Σ entitlement = closed-month distributable; balance now matches Owners
- [ ] Share changes during the year are noted

### Print, PDF, export
- [ ] Print and PDF match the screen exactly, in the viewer's language
- [ ] Draft PDFs and printouts carry the watermark on every page
- [ ] File names follow F6
- [ ] (P2) CSV matches the screen; archived PDFs are created on every close and re-close

### General
- [ ] Owners and Super Admin see the same reports; nothing on the page can edit data
- [ ] Monthly report loads in < 2 s, yearly in < 2 s, PDF in < 5 s
- [ ] Works at 360px width (tables scroll with a fixed first column), in বাংলা and English

---

## 11. Release Phases

| Phase | Features |
| --- | --- |
| **P1 — MVP** | F1 Header & pickers · F2 Monthly report · F3 Yearly report · F4 Draft labelling · F5 Print · F6 PDF · owner statement links |
| **P2** | F7 CSV · F8 Comparisons · F9 Rent roll · F10 Expense analysis · F11 Fund accounts report · F12 Archive · monthly email built from the monthly report |
| **P3** | F13 Excel workbook · multi-house consolidated report · tax-year (July–June) view for Bangladesh income tax |

---

## 12. Open Questions

- [ ] Should Reports open on the latest **closed** month (this PRD) or the current open month?
- [ ] Do owners need a report in the Bangladesh fiscal year (July–June) for tax filing?
- [ ] Should the monthly PDF include bill images, or only list them?
- [ ] Should rent roll show tenant names to all owners, or only unit names?
- [ ] Should the archive keep every version after reopens, or only the latest?
- [ ] Is a signature line ("Prepared by / Checked by") needed on printed reports?