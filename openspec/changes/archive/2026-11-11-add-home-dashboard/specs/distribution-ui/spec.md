## MODIFIED Requirements

### Requirement: Home close reminder
The Home page SHALL show users with `dashboard.admin` a Close-the-month reminder strip when a month earlier than the current Asia/Dhaka month is open: "Close-the-month reminder. {Month} is open." plus unpaid units ("Flat 3A (Nusrat Jahan) has not paid rent yet.") and a **Review distribution** link to that month. It is the most urgent Home reminder (at most two strips show) and can be hidden for the day with **Hide today**. (F14 P1; Home PRD F6, G4)

#### Scenario: October still open in November
- **WHEN** a Super Admin opens Home on 2026-11-03 with October open
- **THEN** the strip reads "Close-the-month reminder. October 2026 is open." and links to `/en/distribution?month=2026-10`

#### Scenario: Hidden for today
- **WHEN** the Super Admin hid the strip on 2026-11-03 and reopens Home the same day
- **THEN** the strip is not shown, and it returns on 2026-11-04 while October is still open
