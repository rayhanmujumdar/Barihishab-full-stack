## MODIFIED Requirements

### Requirement: Pinned notices block
Everyone SHALL see "Pinned notices" with a pin icon, up to 3 notices (Urgent yellow tag, date, bold title, formatted body clamped to 3 lines with **Read more**, unread dot) and **All notices →** linking to `/notices`; tapping **Read more** on an unread notice MUST record it as read and clear its dot. Empty: "No pinned notices." (F9, G6; Notices & Complaints PRD N4, N5)

#### Scenario: No pinned notices
- **WHEN** Home loads and no notice is pinned
- **THEN** the block shows "No pinned notices."

#### Scenario: Read more marks read
- **WHEN** Nasrin taps **Read more** on the unread pinned "Water tank cleaning" notice
- **THEN** the body expands and after refresh the unread dot is gone
