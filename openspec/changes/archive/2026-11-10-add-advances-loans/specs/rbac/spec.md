## MODIFIED Requirements

### Requirement: Role to permission map
The system SHALL define exactly one role→permission map. v1 roles are `SUPER_ADMIN` and `OWNER`. Super Admin MUST hold all 38 keys: the 14 Auth PRD §2 keys, the Income & Expenses PRD §4 P1 keys `transaction.view`, `transaction.create`, `transaction.update`, `transaction.void`, `transaction.adjust`, `attachment.view`, `category.manage`, `unit.manage`, `fund.manage`, the Owners PRD §4 P1 keys `owner.view`, `owner.manage`, `share.manage`, `payout.create`, `advance.create`, `ledger.void`, `ledger.adjust`, the Distribution PRD §4 P1 keys `distribution.view`, `period.close`, `period.reopen`, `reserve.override`, `loan.manage`, and the Advances & Loans PRD §4 keys `loan.view`, `loan.create`, `loan.repay`. Owner MUST hold exactly `profile.update.self`, `profile.password.self`, `session.manage.self`, `audit.view.financial`, `transaction.view`, `attachment.view`, `owner.view`, `distribution.view`, `loan.view`. `ACCOUNTANT` and `VIEWER` MUST exist as role values with an empty permission set. A user's effective permissions MUST be the union over all their roles. (RBAC-02, Income & Expenses PRD §4, Owners PRD §4, Distribution PRD §4, Advances & Loans PRD §4)

#### Scenario: Owner permissions
- **WHEN** the effective permissions of a user with only OWNER are computed
- **THEN** they equal exactly the nine Owner keys, and include no `transaction.create`, `transaction.update`, `transaction.void`, `transaction.adjust`, `category.manage`, `unit.manage`, `fund.manage`, `owner.manage`, `share.manage`, `payout.create`, `advance.create`, `ledger.void`, `ledger.adjust`, `period.close`, `period.reopen`, `reserve.override`, `loan.manage`, `loan.create` or `loan.repay`

#### Scenario: Multiple roles union
- **WHEN** a user holds SUPER_ADMIN and OWNER
- **THEN** their permissions equal the full Super Admin set of 38 keys
