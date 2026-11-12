## MODIFIED Requirements

### Requirement: Close checklist and preview
`GET /api/v1/periods/{month}/close-preview` (permission `period.close`) SHALL return must-pass checks, warnings, the "What happens" list and, for a reopened month, the changes since the last close. Must-pass checks (any failure blocks close): (1) a share set is in force for the month with total units > 0 ("No shares set for {Month}. Set shares in Owners first."); (2) the previous month is closed or none exists; (3) Σ entitlements = Distributable; (4) the month is still open. Warnings (close allowed): no income entries; active units with rent > 0 and no non-voided income entry for that unit in the month (listed by unit and tenant); expenses with no attachment (count); the month has not ended in Asia/Dhaka; the reserve balance would go negative; complaints in OPEN or IN_REVIEW whose linked month is this month (count, any visibility: "{n} open complaint(s) about {Month}."). "What happens" SHALL list the number and total of entitlements, one line per loan deduction (owner, amount) and per skipped instalment ("{Name}'s instalment skipped — no entitlement this month."), the lock, the share snapshot, and the next month opening when it does not exist. The response SHALL carry the month's `reopenCount` as the version to send with the close. (F5, G1, G2, §9; DST-02; Notices & Complaints PRD C8, Rule 15)

#### Scenario: October checklist
- **WHEN** October has valid shares, September is closed, income exists and Flat 3A (Nusrat Jahan) has no rent entry
- **THEN** all must-pass checks pass, one warning lists "Flat 3A (Nusrat Jahan)", and "What happens" lists 5 entitlements totalling 8456900 and a 500000 loan instalment for Tanvir Ahmed

#### Scenario: Shares missing
- **WHEN** no share set is in force for the month
- **THEN** the shares check fails and `canClose` is false

#### Scenario: Owner refused
- **WHEN** an Owner calls the close preview
- **THEN** the response is `403 FORBIDDEN`

#### Scenario: Open complaint warns, never blocks
- **WHEN** October has one IN_REVIEW complaint linked to an October entry and every must-pass check passes
- **THEN** warnings include `OPEN_COMPLAINTS` with count 1 and `canClose` is true
