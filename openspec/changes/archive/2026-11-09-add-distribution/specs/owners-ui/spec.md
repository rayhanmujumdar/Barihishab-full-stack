## ADDED Requirements

### Requirement: Loan instalment in the owner screens
When a payout excess is recorded as a loan, the excess dialog SHALL offer an optional "Monthly instalment" amount. The owner detail SHALL list the owner's ACTIVE loans with outstanding and instalment ("No instalment" when unset), and users with `loan.manage` SHALL be able to set or clear the instalment from there. (Distribution PRD F11; ADV-02)

#### Scenario: Instalment while splitting
- **WHEN** a Super Admin pays Tanvir beyond his balance, chooses Loan and enters a ৳1,000 instalment
- **THEN** the created loan shows "Instalment ৳1,000" on Tanvir's detail

#### Scenario: Owner cannot edit
- **WHEN** an Owner views their detail with an active loan
- **THEN** the loan and its instalment are shown with no edit control
