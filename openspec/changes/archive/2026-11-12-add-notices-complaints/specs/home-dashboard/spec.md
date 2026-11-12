## MODIFIED Requirements

### Requirement: Bookkeeper's desk figures
For `dashboard.admin`, `desk` SHALL contain: House fund total and each **active** fund account (name, type, balance) where the total equals the sum of those balances; pending requests (count of PENDING, equal to the Requests "Needs your decision" count) and how many have waited over 3 days; open complaints (count of complaints in OPEN or IN_REVIEW, all visibilities, from the notices provider); invites waiting (users with status INVITED) and how many of their latest invite links have expired; and the reconciliation result. (F5, G9, Rule 10, PAY-04; Notices & Complaints PRD §13)

#### Scenario: Fund total
- **WHEN** active accounts are Cash 3100000 and DBBL savings 9350875 paisa and an inactive account holds 0
- **THEN** `desk.fund.totalPaisa` is 12450875 and two accounts are listed

#### Scenario: Expired invite counted
- **WHEN** two users are INVITED and one's newest invite token expired yesterday
- **THEN** `desk.invites` is `{ waiting: 2, expired: 1 }`

#### Scenario: Open complaints counted
- **WHEN** one complaint is OPEN, one IN_REVIEW (Admin only) and one RESOLVED
- **THEN** `desk.openComplaints` is 2

### Requirement: Pinned notices seam
`notices` SHALL hold up to 3 effectively pinned, non-archived notices newest first (id, title, body, urgent, date, unread for the viewer) and `noticesMore` whether more exist, read through a single notices provider shared with the Notices section; a notice whose pin-until date has passed (Asia/Dhaka) or that was unpinned or archived MUST NOT be returned. (F9, NTC-01; Notices & Complaints PRD N5)

#### Scenario: No pinned notices
- **WHEN** no notice is pinned
- **THEN** `notices` is an empty array and `noticesMore` is false

#### Scenario: Pinned urgent unread
- **WHEN** an urgent notice is pinned and the viewer has not read it
- **THEN** it is in `notices` with `urgent: true` and `unread: true`
