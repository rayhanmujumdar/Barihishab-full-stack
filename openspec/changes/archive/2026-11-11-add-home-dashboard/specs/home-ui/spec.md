## Purpose

The Home screen (`/[lang]`, S2): each person's own money picture, the house's current month and, for the Super Admin, the bookkeeper's desk and reminders — a read-only summary whose every block links to the section holding the detail. (Home PRD §2, §3, F1–F12, §8, §10)

## ADDED Requirements

### Requirement: Who sees what
Home SHALL render blocks per Home PRD §3: header and greeting, The house this month, Latest activity and Pinned notices for everyone; balance hero, This month for me and My request strip only for viewers linked to an owner; quick actions, Bookkeeper's desk, reminders and setup checklist only with `dashboard.admin`. A Super Admin not linked to an owner MUST see no hero and no empty personal blocks; an Owner MUST NOT see the desk, reminders or quick actions. Visibility MUST be decided on the server. (§3, G2, G12, Rule 6)

#### Scenario: Owner Home
- **WHEN** Nasrin (Owner) opens `/en`
- **THEN** the hero, This month, My request strip, staircase, activity and notices render, and no "Bookkeeper's desk", reminder strip or "+ Expense" button exists

#### Scenario: Admin not an owner
- **WHEN** a Super Admin with no owner record opens `/en`
- **THEN** no "Your current balance" block renders and the desk is the first block after the header

### Requirement: Greeting header and quick actions
The header SHALL show the kicker "{House name} · {Month}" for the current month, the title "Hello, {first name}" / "স্বাগতম, {first name}", and no month picker. With `dashboard.admin` and an open month it SHALL show **Generate this month's rent** (only while some unit lacks rent), **+ Income** and **+ Expense** (primary); each opens the existing Income & Expenses dialog over Home and, after saving, the affected Home blocks update without a full reload. With no open month the buttons are replaced by "No open month — open one from Distribution." linking to Distribution. (F1, G1, Rule 7)

#### Scenario: Record an expense from Home
- **WHEN** the Super Admin clicks **+ Expense**, saves a ৳1,080 Gas expense
- **THEN** the dialog closes on Home and Latest activity's first row is Gas −৳1,080 and the staircase's expense rises by ৳1,080

#### Scenario: No open month
- **WHEN** every month is closed
- **THEN** the header shows "No open month — open one from Distribution." and no quick-action buttons

### Requirement: Balance hero
For an owner-linked viewer, the hero SHALL show the kicker "Your current balance", the balance in very large heavy tabular type coloured green (Owed), red (Advance outstanding) or ink (Settled) and always paired with the word tag, "Share {%}" (or nothing when no share), the explanation sentence for its label, the loan line "Loan {no.}: ৳X left, next deduction ৳Y on {month} close." when a loan is active, and **My statement →** to `/[lang]/owners/{ownerId}`. In the first month (nothing closed) it SHALL add "Your first entitlement arrives when {month} closes." (F2, G14, F12, Rule 3, §8)

#### Scenario: Advance outstanding
- **WHEN** Nasrin's balance is −৳5,000 at 40%
- **THEN** the hero shows "−৳5,000", tag "Advance outstanding", "Share 40%" and "You have taken more than your entitlement. Your next entitlement fills this first."

#### Scenario: Settled
- **WHEN** Rayhan's balance is ৳0
- **THEN** the hero shows "৳0" in ink with tag "Settled" and "Nothing is owed either way."

### Requirement: This month for me
Beside the hero, rows SHALL show **Entitlement · {Month} (preview)** (or "You have no share this month." when the viewer has no units, without "(preview)" once closed), **Received this month**, **Advances this month** (only when > 0) and **Loan outstanding** (amount or "None"). Rows link to Distribution, the statement, the statement, and Advances & Loans respectively. (F3, G3, F12)

#### Scenario: No advances row
- **WHEN** Rayhan has no advances this month
- **THEN** no "Advances this month" row renders and Loan outstanding reads "None"

### Requirement: My request strip
When `myRequest` is present the strip SHALL read "Your {type} request for ৳X is {status}." with "Approved ৳Y" when the approved amount is lower, and **View request** linking to `/[lang]/requests?request={id}`; a one-time decided request reads "Your request was {rejected / paid out} · View". (F4)

#### Scenario: Pending strip
- **WHEN** Nasrin has a pending ৳10,000 advance request
- **THEN** the strip reads "Your advance request for ৳10,000 is pending." with a View request link to that request

### Requirement: Bookkeeper's desk
For `dashboard.admin` a ruled section "Bookkeeper's desk" with the note "Super Admin only" SHALL show tiles in a grid (4 across on desktop, 2 on tablets, 1 on phones): **House fund** (total, each active account and balance → Settings fund accounts), **Reconciliation** (✓ "Balanced · Fund matches the ledgers to the paisa" in green, or ⚠ "Check · Mismatch of ৳X" in red, the formula line in small text, and **See details** opening a dialog listing each formula part and the difference), **Pending requests** (count in a yellow box, plain when 0 → Requests "Needs your decision"), **Open complaints** (count), **Invites waiting** (count, "{n} invite(s) expired" in red → Users). (F5, G8, G9, §8)

#### Scenario: Mismatch details
- **WHEN** the reconciliation is CHECK with mismatch −৳2,000 and the user clicks **See details**
- **THEN** a dialog lists House fund, Owner balances, Reserve, Open month net, Deficit carried, Loans outstanding and "Difference −৳2,000"

#### Scenario: Zero pending
- **WHEN** no request is pending
- **THEN** the Pending requests tile shows "0" without the yellow box

### Requirement: Reminder strips
Under the desk, each reminder SHALL render as a surface strip with a yellow top rule, red alert icon, text and one button: Close-the-month ("Close-the-month reminder. {Month} is open." + unpaid units → **Review distribution**), Rent status ("{n} unit(s) haven't paid rent: Flat 3A (Nusrat Jahan)." → **Generate rent**, opening the Generate-rent dialog), Approved-not-paid ("{Owner}'s ৳X {type} was due on {date}." → **Disburse**, opening that request). Each strip SHALL have **Hide today**, which hides it on this device for the rest of the Asia/Dhaka day without a flash on reload; it returns the next day if still true. (F6, Rule 9)

#### Scenario: Hide today
- **WHEN** the Super Admin clicks **Hide today** on the Rent status strip and reloads
- **THEN** the strip is not shown, and on the next day it shows again while the unit is still unpaid

### Requirement: House this month block
Everyone SHALL see "The house this month" with a **Draft** tag while open and the Distribution staircase cells Income · − Expense · − Reserve · − Previous deficit · **Distributable =** (yellow), the red note "Expenses are higher than income so far — ৳X short." when shortfall > 0, **Every owner's share →** to Distribution for the month, and cells linking to the Income tab, Expense tab and Distribution. With no open month the block is hidden and the header says "No open month." (admins: "No open month — open one from Distribution."). (F7, F12, Rule 1, Rule 4)

#### Scenario: Matches Distribution
- **WHEN** Distribution for 2026-10 shows Distributable ৳84,569
- **THEN** Home's staircase shows Distributable ৳84,569 with the Draft tag

### Requirement: Latest activity block
Everyone SHALL see "Latest activity" listing the activity items as rows: date · title (category name in the viewer's language, or "Payout · {Owner}" / "Advance · {Owner}" / "Loan · {Owner}" / "Repayment · {Owner}") · sub-line · signed amount (green with "+" for money in, ink with "−" for money out). Entry rows open the Income & Expenses detail; owner rows open that owner's statement. **See all →** opens Income & Expenses for the current month. Empty: "Nothing recorded yet this month." (F8, G5)

#### Scenario: Empty house
- **WHEN** no money event exists
- **THEN** the block shows "Nothing recorded yet this month."

### Requirement: Pinned notices block
Everyone SHALL see "Pinned notices" with a pin icon, up to 3 notices (Urgent yellow tag, date, bold title, body clamped to 3 lines with **Read more**, unread dot) and **All notices →** when more exist; empty: "No pinned notices." (F9, G6)

#### Scenario: No notices yet
- **WHEN** Home loads before the Notices section exists
- **THEN** the block shows "No pinned notices."

### Requirement: Setup checklist
When `setup` is present, the Super Admin SHALL see a checklist above the desk with the six steps, each with ✓ when done or a **Continue** link to the page that completes it (Settings, Owners, Distribution, Users). (F12)

#### Scenario: Fresh install
- **WHEN** a Super Admin opens Home on a property with only a name
- **THEN** House info shows ✓ and the other five steps show **Continue**

### Requirement: Layout order
On desktop (≥ 860px) the order SHALL be header → hero + this month (two columns) → my request strip → setup → desk → reminders → house this month → activity and notices side by side. On mobile (< 860px) it SHALL be header → hero → this month → my request strip → reminders → setup → desk → house this month → notices → activity. Home MUST follow the design system (ink on paper, one yellow signal, zero radius, 2px rules between sections, heavy tabular money, 44px touch targets) and work at 360px with no horizontal scroll, in বাংলা and English with Bangla digits and lakh grouping. (F10, Rule 11)

#### Scenario: Bangla at 360px
- **WHEN** an Owner opens `/bn` at 360px width
- **THEN** all labels are Bangla, amounts use Bangla digits with lakh grouping, and the page has no horizontal scroll

### Requirement: Independent loading and failure
Each block SHALL stream independently with a skeleton while loading, so one slow block does not hold the page. A block that fails SHALL show "Couldn't load {block}. Try again" with a retry button that reloads only that block, while the rest of Home keeps working. (F11)

#### Scenario: Activity fails
- **WHEN** loading Latest activity throws
- **THEN** that block shows "Couldn't load Latest activity. Try again" and the hero and staircase still render

### Requirement: Freshness
After any action started from Home (entry saved, rent generated) the affected blocks SHALL update at once. On desktop Home SHALL refresh when the tab becomes visible again after 5 minutes or more hidden; on mobile pulling down at the top of the page SHALL refresh it; after a refresh the note "Updated just now" SHALL show briefly. (F11, G13)

#### Scenario: Return after lunch
- **WHEN** the Home tab was hidden for 6 minutes and becomes visible
- **THEN** Home re-fetches its blocks and shows "Updated just now"
