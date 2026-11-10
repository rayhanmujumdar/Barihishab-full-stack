## Purpose

The shared app shell around every signed-in page: the desktop sidebar and top bar, and the mobile top bar, five-item bottom navigation and More sheet, with role-aware primary actions. (Home PRD §4; main PRD §8.1)

## ADDED Requirements

### Requirement: Desktop sidebar
At 860px and wider the sidebar SHALL show the yellow square logo with "BariHisab", a "{House name}" line beneath it, the permitted menu with Home first, square yellow badges for pending requests (or the owner's unseen decisions) and pending invites (and unread notices once that section exists), and at the bottom the avatar, name, role and **Log out**. (§4 Desktop)

#### Scenario: House line
- **WHEN** a user on a 1280px screen opens any page of "Ahmed Villa"
- **THEN** the sidebar shows "Ahmed Villa" under the logo

### Requirement: Top bar primary action
The top bar SHALL show the language toggle and one role primary action: **+ New entry** for users with `transaction.create` while some month is open (opens a new expense in Income & Expenses, `/[lang]/entries?new=EXPENSE`; none when no month is open), otherwise **+ Request money** for users with `request.create` who are linked to an owner (`/[lang]/requests?new=1`), otherwise none. A Super Admin who is also an owner SHALL see **+ New entry** in the top bar and **+ Request money** stays available on Requests. Opening those URLs MUST open the corresponding form dialog on arrival, including when that page is already open; closing it MUST drop the `new` parameter. (§4 Desktop, §3 "+ Request money shortcut")

#### Scenario: Owner action
- **WHEN** an Owner clicks **+ Request money** in the top bar
- **THEN** `/en/requests?new=1` opens with the request form dialog open

#### Scenario: Admin action
- **WHEN** the Super Admin clicks **+ New entry**
- **THEN** `/en/entries?new=EXPENSE` opens with the new-expense drawer open

### Requirement: Mobile bottom navigation
Below 860px the bottom nav SHALL show exactly five items with 44px+ targets, the active item marked with a yellow top bar and `aria-current="page"`. For users with `transaction.create`: Home · Entries · **[+]** (yellow, opens a new expense) · Distribution · More; with no open month the [+] cell is left out and Owners takes the fourth slot. For everyone else: Home, then the first three permitted of Accounts (Owners), Requests, Notices (once that section exists), Income & expenses, Advances & loans, then More. Items the role cannot open MUST NOT appear. (§4 Mobile, main PRD §8.1)

#### Scenario: Super Admin bar
- **WHEN** a Super Admin opens `/en` at 360px
- **THEN** the bottom nav shows Home, Entries, +, Distribution and More, in that order

#### Scenario: No open month
- **WHEN** every month is closed and a Super Admin opens `/en` at 360px
- **THEN** the bottom nav shows Home, Entries, Distribution, Owners and More, and the top bar has no + New entry

#### Scenario: Owner bar
- **WHEN** an Owner opens `/en` at 360px
- **THEN** the bottom nav shows Home, Accounts, Requests, Income & expenses and More

### Requirement: More sheet
**More** SHALL open a bottom sheet listing every remaining permitted section (with the same badges) and **Log out**, which asks for confirmation first. Choosing a section MUST close the sheet and navigate. (§4 Mobile)

#### Scenario: Reach Settings on a phone
- **WHEN** the Super Admin taps More, then Settings
- **THEN** the sheet closes and `/en/settings` opens

### Requirement: Language persistence
The language toggle SHALL switch every label, month name and digit immediately and remember the choice in the user's profile. (§4 Language)

#### Scenario: Switch to Bangla
- **WHEN** a logged-in user toggles to বাংলা on Home
- **THEN** Home re-renders at `/bn` with Bangla labels and digits, and the next login opens in বাংলা
