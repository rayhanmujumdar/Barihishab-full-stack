# reports-ui Specification

## Purpose

Gives every member a Reports page — Monthly, Yearly, Rent roll, Expenses and Fund accounts — that reads like an official document, labels drafts unmistakably, prints and saves as PDF exactly as shown, and exports CSV. Follows the BariHisab design system in বাংলা and English from 360px up. (Reports PRD §2, F1–F11, §6, §8, §10; main PRD S9)

## Requirements

### Requirement: Reports routes and default view
The page SHALL live at `/[lang]/reports/monthly?month=YYYY-MM`, `/[lang]/reports/yearly?year=YYYY`, `/[lang]/reports/rent-roll?year=YYYY`, `/[lang]/reports/expenses?from=YYYY-MM&to=YYYY-MM[&category=…]` and `/[lang]/reports/funds?month=YYYY-MM` or `?year=YYYY`, so a link reopens the same report. `/[lang]/reports` SHALL redirect to Monthly; Monthly without `month` SHALL show the latest closed month (the open month is one step newer in the picker). Users without `report.view` SHALL see the Forbidden view; an unknown month or a malformed parameter SHALL fall back to the default period. (F1, G16)

#### Scenario: Open Reports
- **WHEN** an Owner opens `/en/reports` while September 2026 is the latest closed month and October is open
- **THEN** the URL becomes `/en/reports/monthly` and "Monthly report · September 2026" is shown with "Final · closed {date}"

#### Scenario: Shareable link
- **WHEN** a user picks October 2026 in the month picker
- **THEN** the URL gains `?month=2026-10` and reloading shows October

### Requirement: Reports header
The header SHALL show the house name as kicker, the title "Reports" (রিপোর্ট), a tab row Monthly · Yearly · Rent roll · Expenses · Fund accounts (selected tab = ink fill, `aria-current="page"`, scrolls sideways on phones), the period picker of the active tab, and the actions **Print**, **PDF** and **CSV** (CSV only on Monthly and Yearly). The month picker SHALL list months that have a period with prev/next steps and a Draft marker for open months; the year picker SHALL list only years with data. (F1, G3)

#### Scenario: Year picker lists years with data
- **WHEN** periods exist only in 2026
- **THEN** the Yearly year picker offers only 2026

### Requirement: Monthly report view
The Monthly tab SHALL show, in order: the title "Monthly report · {Month}" with a **Final · closed {date}** tag or a yellow **Draft — not closed yet** tag; a summary line "Income ৳X · Expenses ৳Y · Distributable ৳Z" (plus "Deficit ৳D carried" when it applies); two columns **Income** and **Expenses (all)** with totals, "of which paid from Reserve ৳X" under the expense total, and one row per category "{name} · {n} entries" with amount, "{amount} · {%}" and a flat bar (largest = 100%); the staircase Income · − Expenses counted · − Reserve · − Previous deficit · yellow **= Distributable**, with the Distribution deficit and Reserve notes; the owner table Owner · Share (% and units) · Opening · Entitlement · Received · Advance · Loan ded. · Balance (with its word: Owed / Advance outstanding / Settled) · Loan outstanding, with a totals row; the notes that apply; and **Owner statements** links, one per owner, to that owner's statement for the month. A month without entries SHALL show "—" in both columns and "No entries in {Month}." (F2, G1, G5, G7, G13, G14, §8)

#### Scenario: Draft tag
- **WHEN** October 2026 (open) is shown
- **THEN** the title has the yellow tag "Draft — not closed yet" and the Distributable cell shows ৳84,569

#### Scenario: Empty month
- **WHEN** a month with no entries is shown
- **THEN** both columns show "—" and the text "No entries in {Month}." appears

#### Scenario: Owner statement link
- **WHEN** the user follows Nasrin's link under Owner statements on October 2026
- **THEN** `/en/owners/{id}?from=2026-10&to=2026-10` opens

### Requirement: Expand a category
Tapping a category row SHALL expand it (a button with `aria-expanded`) to list its entries: date, description, vendor, unit (income), amount, a "Reserve" tag for From-Reserve expenses, and a bill icon that opens the entry's attachments in the existing attachment viewer. Voided entries are never listed. (F2.5, G4, §6.1)

#### Scenario: Open a bill from the report
- **WHEN** an Owner expands Electricity and taps the bill icon of the DESCO entry
- **THEN** the attachment viewer opens on that bill

### Requirement: Monthly comparisons display
Next to Income, Expenses (all) and Distributable the Monthly view SHALL show "vs {last month}: +৳X (+Y%)" and "vs {same month last year}" when available, each with an arrow (▲/▼) and the words "up"/"down"; an expense category row SHALL show "▲ ৳X vs last month" or "▼ ৳X vs last month" only when the change exceeds 20%. Colour MUST NOT be the only signal. (F8, Rule 12)

#### Scenario: Big rise flagged
- **WHEN** Electricity was 400000 in September and 630000 in October
- **THEN** the October Electricity row shows "▲ ৳2,300 vs last month"

### Requirement: Yearly report view
The Yearly tab SHALL show the title "Yearly report · {year}" with "{n} months closed, {m} draft"; three totals Income, Expenses (all) and a yellow Distributable, each for closed months with "+ ৳X draft" when a draft month exists; a 12-month bar chart (Income ink, Expenses yellow, 2px ink baseline, square legend swatches, draft months hatched with a "Draft" key, empty months left blank, each month linking to its Monthly report, and an accessible text label per month); the month table with rows Income · Expenses (all) · of which from Reserve · Reserve kept · Deficit carried · **Distributable**, a column per month (draft columns marked "Draft", empty "—") and a **Total** (closed months); the top 5 expense categories with amount and %; the owner year table Owner · Share now (+ "changed in {month}: {before} → {after}") · Opening (1 Jan) · Entitlement · Paid out · Advances · Loan ded. · Balance now · Loan outstanding with totals; and Owner statements links for the year. A year without data SHALL show "No data for {year} yet." (F3, G2, G7, G8, §8)

#### Scenario: Draft column marked
- **WHEN** 2026 has October open
- **THEN** the October column header and chart bar are marked "Draft" and the Income total shows "+ ৳1,03,000 draft"

#### Scenario: Chart month opens Monthly
- **WHEN** the user taps April in the chart
- **THEN** `/en/reports/monthly?month=2026-04` opens

### Requirement: Rent roll view
The Rent roll tab SHALL show a grid with units down the side (unit and tenant) and the months of the chosen year across: a paid cell shows the amount and links to Entries for that month, an empty cell shows "—", an arrear cell shows "Arrear in {month}"; plus per-unit totals, an Expected column, per-month totals and collection %. (F9, §6.4)

#### Scenario: Follow up unpaid rent
- **WHEN** the Super Admin opens Rent roll · 2026
- **THEN** Flat 3A's October cell shows "—"

### Requirement: Expense analysis view
The Expenses tab SHALL let the user choose a from-month, a to-month and optional categories (kept in the URL) and show the total with "of which from Reserve", a by-category list (amount, %, entries), top 10 vendors, a per-month trend for the chosen categories and the 10 biggest single expenses. A range longer than 36 months SHALL show an inline error instead of results. (F10)

#### Scenario: Repairs spend
- **WHEN** the user picks January–December 2026 and the Repairs category
- **THEN** the total shows ৳1,75,700 and "of which from Reserve ৳18,000"

### Requirement: Fund accounts view
The Fund accounts tab SHALL offer Month and Year modes and show one row per fund account with Opening, Income in, Expenses out, Owner payments out, Loans out, Loan repayments in and Closing, with a totals row. (F11)

#### Scenario: Year mode
- **WHEN** the user switches to Year 2026
- **THEN** the URL becomes `?year=2026` and each account shows its 1 Jan opening and today's closing

### Requirement: Print view
**Print** SHALL open `/[lang]/reports/{monthly|yearly}/print?…` for the same period, which renders the same report content with no app chrome on A4 portrait, black on white (yellow becomes grey), table headers repeated on every page, sections not split mid-row, a header with house name, address, report title, period and status (Final / "Draft · may change"), and a footer "Generated by {Name} on {date, time} · BariHisab". The monthly print view SHALL end with an **Entries** appendix listing every non-voided entry of the month (date, category, description, vendor, fund account, amount). Every figure MUST equal the on-screen report. (F5, Rule 8)

#### Scenario: Print a final month
- **WHEN** the user taps Print on September 2026
- **THEN** the print view shows "Monthly report · September 2026", "Final", the same totals as the screen, and the Entries appendix

### Requirement: Draft watermark
Print views of a draft month (or a year containing a draft month) SHALL show a diagonal **DRAFT — NOT FINAL** watermark repeated on every printed page and "Draft · may change" in the header. (F4, §6.3, §8)

#### Scenario: Draft printout
- **WHEN** the October 2026 print view is printed
- **THEN** every page carries "DRAFT — NOT FINAL"

### Requirement: PDF by print view
**PDF** SHALL open the same print view with the document title set to the PRD file name — `BariHisab-Monthly-{YYYY-MM}.pdf` (with `-DRAFT` for an open month) or `BariHisab-Yearly-{YYYY}.pdf` — show "Preparing PDF…" until the report is ready, show a hint to choose "Save as PDF" in the print dialog, and open the print dialog automatically. If the report cannot be loaded the view SHALL show "Couldn't create the PDF. Try again." with a retry. The PDF SHALL use the viewer's current language (Bangla digits and month names in বাংলা). (F6, §8)

#### Scenario: Draft file name
- **WHEN** the user taps PDF on October 2026 (open)
- **THEN** the print view's document title is `BariHisab-Monthly-2026-10-DRAFT`

#### Scenario: Bangla PDF
- **WHEN** the user taps PDF on `/bn/reports/monthly?month=2026-09`
- **THEN** the print view shows "সেপ্টেম্বর ২০২৬" and Bangla digits

### Requirement: CSV download
**CSV** SHALL download the API CSV for the current Monthly or Yearly period with the file name from the reports capability. (F7)

#### Scenario: Monthly CSV
- **WHEN** the user taps CSV on September 2026
- **THEN** `BariHisab-Monthly-2026-09.csv` downloads

### Requirement: Read-only, responsive and bilingual
The Reports page SHALL contain no control that changes data. At 360px the owner, month and rent-roll tables SHALL scroll sideways with the first column fixed and the chart SHALL show 12 thin bar pairs with month initials. Every label SHALL exist in English and বাংলা; money SHALL use ৳ with lakh grouping and Bangla digits in বাংলা; colour is never the only signal. While data loads the page SHALL show a layout-shaped skeleton (`role="status"`). (§10 General, Rules 10–12)

#### Scenario: Phone width
- **WHEN** the Yearly tab is opened at 360px
- **THEN** the page has no horizontal page scroll and the month table's first column stays visible while scrolling the table

### Requirement: Charts on every report tab
Every Reports tab SHALL show a bar chart of its main figures, drawn with the design-system chart rules (flat bars, no gridlines, 2px ink baseline, one value axis, income ink and expenses yellow, a legend for two or more series, a hover tooltip): Monthly — income and expenses (all) by category with "amount · %" labels; Yearly — income vs expenses (all) per month with draft months hatched, a month opening its Monthly report; Rent roll — rent collected per month with expected rent as a dashed line; Expenses — expenses by category and by month; Fund accounts — money in vs money out per account. Every chart SHALL have a labelled figure, a screen-reader text summary of every plotted value, and a table view of the same numbers on the page. Monthly and Yearly print views SHALL include their charts, with yellow printed grey. On phones the month axis SHALL use month initials. (Reports PRD F2, F3, F9–F11; user request 2026-11-11)

#### Scenario: Yearly chart month opens Monthly
- **WHEN** the user follows October in the Yearly chart's month row
- **THEN** `/en/reports/monthly?month=2026-10` opens

#### Scenario: Charts print grey
- **WHEN** the Monthly print view is printed
- **THEN** the expense bars print grey and the income bars ink

#### Scenario: Fund accounts chart
- **WHEN** the Fund accounts tab is opened
- **THEN** a figure "Money in and out by account" shows two bars per account with a Money in / Money out legend
