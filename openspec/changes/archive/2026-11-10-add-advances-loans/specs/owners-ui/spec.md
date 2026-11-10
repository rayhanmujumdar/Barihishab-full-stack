## MODIFIED Requirements

### Requirement: Loan instalment in the owner screens
When a payout excess is recorded as a loan, the excess dialog SHALL offer an optional "Monthly instalment" amount. The owner detail SHALL list the owner's ACTIVE loans with loan number, outstanding and instalment ("Manual" when unset), each linking to the loan's detail on the Advances & loans screen, and users with `loan.manage` SHALL be able to change the instalment from there with a required reason ("A reason is required — every owner can see it."). (Distribution PRD F11; ADV-02; Advances & Loans PRD F7)

#### Scenario: Instalment while splitting
- **WHEN** a Super Admin pays Tanvir beyond his balance, chooses Loan and enters a ৳1,000 instalment
- **THEN** the created loan shows "Instalment ৳1,000" on Tanvir's detail

#### Scenario: Change needs a reason
- **WHEN** a Super Admin changes the instalment on Tanvir's detail and leaves the reason empty
- **THEN** the dialog shows "A reason is required — every owner can see it." and nothing is sent

#### Scenario: Owner cannot edit
- **WHEN** an Owner views their detail with an active loan
- **THEN** the loan and its instalment are shown with no edit control, and the loan number links to its detail

### Requirement: Pay and advance drawer
**Pay** SHALL open a side drawer with a balance panel "{Name} · balance ৳X (owed)", "Against: {oldest due month}" and **Use full balance ৳X**, then Amount, Date (default today), Fund account (with balance), Method segmented control (Cash / Bank / bKash / Nagad), Reference no. ("bKash TrxID or cheque no.", required except Cash), Note and receipt attachment. When the balance is ≤ 0 the amount starts empty and the drawer warns "Nothing is owed — anything you pay becomes an advance or loan". Non-blocking warnings appear for amount above the fund account or House Fund balance ("This is more than the House Fund holds (৳X)."). When the server answers `EXCEEDS_BALANCE`, a "More than the balance" dialog shows Payout ৳X / Excess ৳Y with **Record excess as an advance**, **Record excess as a loan**, **Change the amount**. **Record advance** uses the same drawer with a required reason ("visible to all owners"), an advance-limit panel (current balance, advance limit or "No limit yet — no closed months.", and how much of the limit the amount would use), "{Name} is owed ৳X — pay that first; an advance is for money beyond what is owed." when the balance is positive, and "Above the advance limit — allowed, but flagged." when the amount goes over the limit. Success toast "Payment of ৳X recorded for {Name}"; the detail, list figures and fund balances refresh without a full reload. Double submit MUST be prevented (one Idempotency-Key per open drawer). (F11, F12, G8, §8; Advances & Loans PRD F12, F14, G11)

#### Scenario: Pay more than owed
- **WHEN** a Super Admin enters ৳13,000 for Tanvir (owed ৳8,055.85) and saves
- **THEN** the dialog shows "Payout ৳8,055.85" and "Excess ৳4,944.15"; choosing "Record excess as an advance" adds a Payout and an Advance row and the balance shows "Advance outstanding ৳4,944.15"

#### Scenario: Advance panel
- **WHEN** a Super Admin opens Record advance for Nasrin (balance ৳0, limit ৳33,162.53) and types ৳5,000
- **THEN** the panel shows the limit and "15% of the limit" with no over-limit warning
