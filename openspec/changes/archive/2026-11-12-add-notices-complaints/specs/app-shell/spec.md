## MODIFIED Requirements

### Requirement: Desktop sidebar
At 860px and wider the sidebar SHALL show the yellow square logo with "BariHisab", a "{House name}" line beneath it, the permitted menu with Home first, square yellow badges for pending requests (or the owner's unseen decisions), pending invites, and Notices (unread notices plus complaints the viewer takes part in with unseen comments), and at the bottom the avatar, name, role and **Log out**. (§4 Desktop; Notices & Complaints PRD §11)

#### Scenario: House line
- **WHEN** a user on a 1280px screen opens any page of "Ahmed Villa"
- **THEN** the sidebar shows "Ahmed Villa" under the logo

#### Scenario: Notices badge
- **WHEN** an Owner has one unread notice
- **THEN** the Notices item shows a yellow badge "1", and no badge once it is read

### Requirement: Mobile bottom navigation
Below 860px the bottom nav SHALL show exactly five items with 44px+ targets, the active item marked with a yellow top bar and `aria-current="page"`. For users with `transaction.create`: Home · Entries · **[+]** (yellow, opens a new expense) · Distribution · More; with no open month the [+] cell is left out and Owners takes the fourth slot. For everyone else: Home, then the first three permitted of Accounts (Reports, labelled "Accounts" / "হিসাব"), Requests, Notices, Income & expenses, Advances & loans, then More; Owners is reached from More. Items the role cannot open MUST NOT appear. (§4 Mobile, main PRD §8.1, Reports PRD G16, Notices & Complaints PRD §2.1)

#### Scenario: Super Admin bar
- **WHEN** a Super Admin opens `/en` at 360px
- **THEN** the bottom nav shows Home, Entries, +, Distribution and More, in that order

#### Scenario: No open month
- **WHEN** every month is closed and a Super Admin opens `/en` at 360px
- **THEN** the bottom nav shows Home, Entries, Distribution, Owners and More, and the top bar has no + New entry

#### Scenario: Owner bar
- **WHEN** an Owner opens `/en` at 360px
- **THEN** the bottom nav shows Home, Accounts, Requests, Notices and More, and Accounts links to `/en/reports`

#### Scenario: Owners in More
- **WHEN** an Owner taps More at 360px
- **THEN** the sheet lists Owners and Income & expenses
