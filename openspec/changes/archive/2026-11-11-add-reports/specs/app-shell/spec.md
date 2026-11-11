## MODIFIED Requirements

### Requirement: Mobile bottom navigation
Below 860px the bottom nav SHALL show exactly five items with 44px+ targets, the active item marked with a yellow top bar and `aria-current="page"`. For users with `transaction.create`: Home · Entries · **[+]** (yellow, opens a new expense) · Distribution · More; with no open month the [+] cell is left out and Owners takes the fourth slot. For everyone else: Home, then the first three permitted of Accounts (Reports, labelled "Accounts" / "হিসাব"), Requests, Notices (once that section exists), Income & expenses, Advances & loans, then More; Owners is reached from More. Items the role cannot open MUST NOT appear. (§4 Mobile, main PRD §8.1, Reports PRD G16)

#### Scenario: Super Admin bar
- **WHEN** a Super Admin opens `/en` at 360px
- **THEN** the bottom nav shows Home, Entries, +, Distribution and More, in that order

#### Scenario: No open month
- **WHEN** every month is closed and a Super Admin opens `/en` at 360px
- **THEN** the bottom nav shows Home, Entries, Distribution, Owners and More, and the top bar has no + New entry

#### Scenario: Owner bar
- **WHEN** an Owner opens `/en` at 360px
- **THEN** the bottom nav shows Home, Accounts, Requests, Income & expenses and More, and Accounts links to `/en/reports`

#### Scenario: Owners in More
- **WHEN** an Owner taps More at 360px
- **THEN** the sheet lists Owners

## ADDED Requirements

### Requirement: Reports navigation item
The navigation SHALL include "Reports" (রিপোর্ট, `/[lang]/reports`) for users with `report.view`, placed after Advances & loans in the sidebar; it SHALL be active on every `/reports/*` page, and for Super Admin it appears in the More sheet on phones. (Reports PRD F1, G16; main PRD §8.1)

#### Scenario: Super Admin reaches Reports on a phone
- **WHEN** a Super Admin taps More, then Reports at 360px
- **THEN** `/en/reports/monthly` opens with the Reports item active

#### Scenario: Sidebar item
- **WHEN** an Owner opens `/en/reports/yearly` at 1280px
- **THEN** the sidebar shows "Reports" marked as the current page
