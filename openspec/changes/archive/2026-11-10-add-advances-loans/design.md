## Context

See proposal.md for motivation. Current state the design builds on:

- `loans` (owners migration) holds disbursement only: principal, date, fund, method, ref, reason, optional instalment, status `ACTIVE | REPAID | WRITTEN_OFF`, `payout_entry_id`. Created only by a payout split (`lib/owners/loan-service.ts → createLoanInTx`).
- Outstanding = principal + Σ owner-ledger amounts linked by `loan_id` (LOAN_DEDUCTION −, their REVERSAL +). There is no `loan_movements` table yet (deviation from main PRD §9.3, recorded in the distribution change).
- `fundMovements` subtracts the principal of every loan whatever its status; deductions move no cash.
- Close (`lib/distribution/close-service.ts`) posts ENTITLEMENT + LOAN_DEDUCTION with `createMany`, flips paid-off loans to REPAID, locks all ACTIVE loans `FOR UPDATE`. Reopen voids **every** ENTITLEMENT/LOAN_DEDUCTION of the month and reverses them.
- `loanDeductions()` (pure, `lib/accounting/distribution.ts`) has no "disbursed before this month" filter.
- Advances: `POST /api/v1/advances` writes an ADVANCE entry; the limit is a fixed 1× of the last-3-closed-month average and sums ENTITLEMENT rows **including voided ones** (double counts a reopened-and-reclosed month).
- UI pattern: server page loads via services → client view; mutations via `useApiMutation` + `apiFetch`, then `router.refresh()`. Print views live in `app/[lang]/(print)/…` with `AutoPrint`.
- Money writes: lock owner row → lock latest open period (FOR SHARE via `lockPeriod`) → compute with pure module → insert → audit → idempotency row, in one transaction.

## Goals / Non-Goals

**Goals:**
- One formula for outstanding used by list, detail, distribution preview, close and owner screens.
- Every loan movement visible in one oldest-first history, assembled on read — no stored running totals.
- Keep Distribution and Owners behaviour unchanged except the two PRD-mandated fixes (instalment timing, reopen scope).

**Non-Goals:**
- No new table for change history (audit log is the source).
- No client-side data cache layer; the page re-renders from the server after each write.
- No backfill of `PAYOUT_SPLIT` origin for historical advances (not identifiable; they show "Direct").

## Decisions

### D1 · `loan_movements` for cash-side events only; deductions stay in the owner ledger
New table `loan_movements(id, property_id, loan_id, period_id, type, amount_paisa, movement_date, fund_account_id?, method?, reference_no?, note?, reverses_id? unique, voided_at/by/reason, created_by, created_at)` with `type ∈ CASH_REPAYMENT | REVERSAL | CANCELLATION | WRITE_OFF`. `amount_paisa` is the signed effect on the **outstanding** (repayment −, its reversal +, cancellation −principal, write-off −outstanding).
Deductions (close or manual) remain LOAN_DEDUCTION ledger rows linked by `loan_id`, because they must change the owner balance and already flow through Distribution.
- Outstanding = principal + Σ ledger(loan_id) + Σ loan_movements(loan_id). One `groupBy` per source.
- Fund effect of a movement = −amount when `fund_account_id` is set. Cancellation and write-off carry the loan's fund account, so cancel returns the principal and write-off offsets its own expense.
- *Alternative:* full main-PRD `loan_movements` mirroring every deduction too. Rejected: two rows per deduction, and close/reopen would have to keep both in step.
- Same DB guards as the ledger: no-delete trigger, closed-period insert/update trigger (void marking allowed), `CHECK (amount_paisa <> 0)`, reversal-sign check.

### D2 · `origin` column on ledger entries and loans
Enum `EntryOrigin { DIRECT, CLOSE, PAYOUT_SPLIT }` on `owner_ledger_entries.origin` (default DIRECT) and `loans.origin` (DIRECT | PAYOUT_SPLIT). Migration backfills ENTITLEMENT/LOAN_DEDUCTION → CLOSE and all existing loans → PAYOUT_SPLIT (only the split could create them).
- Reopen filters `origin = CLOSE`, so a manual deduction recorded before a close is not reversed by a reopen.
- Void-repayment refuses `origin = CLOSE` deductions (F8).
- Source shown on loans/advances (G13). Leaves room for `REQUEST` (F16).
- *Alternative:* booleans `posted_on_close` + `from_payment`. Rejected: two columns for one concept.

### D3 · Loan numbers
`loans.number INT NOT NULL`, `UNIQUE(property_id, number)`. Next number = `MAX(number)+1` under `pg_advisory_xact_lock(hashtext('loan_number:'||property))`, taken inside the create transaction (direct and payout split). Backfill by `ROW_NUMBER() OVER (PARTITION BY property_id ORDER BY created_at, id)`.
- *Alternative:* a Postgres sequence. Rejected: per-property sequences need dynamic DDL; the lock is cheap at this volume.

### D4 · Status transitions
ACTIVE ↔ REPAID is derived from outstanding after every write (repayment, void, close, reopen). CANCELLED and WRITTEN_OFF are terminal and set only by their endpoints. `LoanStatus` enum gains `CANCELLED`. Every loan write locks the loan row `FOR UPDATE` (as close already does), so close and a repayment can't both read the same outstanding.

### D5 · Pure module `lib/accounting/loans.ts` (100 % coverage)
- `loanFigures(principal, ledgerRows, movementRows)` → outstanding, repaidCash, repaidDeduction, repaid, progress.
- `expectedFinish(outstanding, instalment, disbursedMonth, earliestOpenMonth)` → `{ monthsLeft, finishMonth, nextDeduction }` (§7.2).
- `loanHistory(loan, ledgerRows, movementRows, skippedMonths)` → sorted movements with running outstanding and `voidable`.
- `repaymentCap(mode, outstanding, ownerBalance)` → max allowed (G1/G2).
- `advanceStatuses(entries)` → FIFO recovery per advance (§7.6, spec "Advance recovery status").
- `advanceLimit()` in `lib/accounting/owners.ts` gains the multiplier: `floor(avg × pct / 100)`.
- `loanDeductions()` gains the month argument and skips loans with `disbursedOn >= monthStart` (§7.3).

### D6 · Write-off books a locked house expense
Write-off inserts a `WRITE_OFF` loan movement (−outstanding, loan's fund account) and a `HouseTransaction` EXPENSE (same amount and fund, category `LOAN_WRITTEN_OFF`, new `TxnSource.LOAN_WRITE_OFF`) in the latest open month. Net fund effect 0 (the cash left at disbursement); the expense lowers that month's Surplus, so all owners share it (PRD default for open question 2). The transactions service refuses PATCH/void of `LOAN_WRITE_OFF` rows (`409 NOT_EDITABLE`) and manual use of the category (`422`). The category is system and seeded by migration + `lib/master-data/defaults.ts`.
- *Alternative:* charge the borrower via an ADJUSTMENT. Rejected: contradicts PRD F10; can be revisited when open question 2 is answered.

### D7 · Change history from the audit log
Loan detail reads `audit_logs` where `entity_type = 'loan' AND entity_id = id` for `loan.created`, `loan.updated`, `loan.cancelled`, `loan.written_off`, `loan.repayment_voided` (who/when/before/after/reason). Repayments themselves are movements, not changes. Avoids a `loan_changes` table; the audit log is append-only already.

### D8 · Skipped instalments from snapshots
Closed months' `periods.snapshot.skippedLoans` already records skips; the detail reads snapshots of CLOSED periods after disbursement and adds "Instalment skipped" rows (amount 0, dated the month's last day). Nothing new is written at close.

### D9 · `PATCH /loans/{id}` now requires `reason`
Deviation from the "breaking changes go to v2" rule: the only caller is the in-repo Owners dialog (updated in the same change), the app is pre-release, and PRD F7 makes the reason mandatory. Documented in the OpenAPI description.

### D10 · API layout (all under `/api/v1`, `route.ts` + `schema.ts`, registered in `openapi.ts`, tag "Advances & loans")
| Method | Path | Permission |
| --- | --- | --- |
| GET, POST | `/loans` | `loan.view` / `loan.create` (+ Idempotency-Key) |
| GET, PATCH | `/loans/{id}` | `loan.view` / `loan.manage` |
| POST | `/loans/{id}/repayments` | `loan.repay` (+ Idempotency-Key) |
| POST | `/loans/{id}/repayments/{repaymentId}/void` | `loan.manage` |
| POST | `/loans/{id}/cancel` | `loan.manage` |
| POST | `/loans/{id}/write-off` | `loan.manage` |
| GET (added), POST | `/advances` | `loan.view` / `advance.create` |
| GET | `/advances/by-owner` | `loan.view` |
| GET, PUT | `/settings/advance-limit` | `settings.manage` |
GET handlers call `await connection()`. New error codes in `lib/api/errors.ts` (en + bn): `LOAN_HAS_REPAYMENTS`, `NOT_EDITABLE`; `NOT_VOIDABLE` reused with a loan-specific message via `failWith(..., message)`.

### D11 · Services
- `lib/loans/loan-service.ts` (moved from `lib/owners/loan-service.ts`; the few importers — ledger-service, distribution month-data/service, owner-service — are updated): reads (`listLoans`, `loanDetail`, `activeLoans`, `loanOutstandingByOwner`), writes (`createLoan`, `createLoanInTx`, `setLoanInstallment`, `recordRepayment`, `voidRepayment`, `cancelLoan`, `writeOffLoan`).
- `lib/loans/advance-service.ts`: `listAdvances`, `standingByOwner`, `advanceLimits` (shared with `createAdvance`).
- `lib/loans/settings-service.ts`: advance-limit read/write in `properties.settings.advanceLimit` (same pattern as reserve).
- Owner/period locking helpers (`lockOwner`, `latestOpenPeriod`, `checkCashOut`, `cashWarnings`) are exported from `ledger-service.ts` and reused, not copied.

### D12 · UI
- Route `app/[lang]/(app)/advances/page.tsx` (server): reads `tab`, `owner`, `status`, `year`, `loan` from `searchParams`, loads only what the active tab needs plus tiles, passes perms from `can()`.
- `components/loans/`: `AdvancesLoansView` (header, tiles, tabs), `LoanCard`, `LoanDetailSheet` (shadcn `Sheet`), `LoanDrawer` (shared new-loan / advance form, owner select), `RepaymentDialog`, `InstalmentDialog`, `LoanActionDialog` (void / cancel / write-off with reason, built on `confirm-dialog`), `AdvancesTable`, `ByOwnerTable`, `AdvanceLimitPanel` (also used by the Owners `PayDrawer` advance mode).
- Settings: `components/settings/AdvanceLimitSettings.tsx` beside `ReserveSettings`.
- Print: `app/[lang]/(print)/loans/[id]/statement/print/page.tsx` + `components/loans/PrintLoanStatement.tsx`, reusing `AutoPrint`.
- Filters are selects (no free-text search) → no debounce needed; owner select uses the existing list.
- Design system: ink-on-paper, zero radius, the Active tag is the one yellow fill; heroicons only; all strings in `lib/i18n/{en,bn}.ts`.

### D13 · Tests
- Unit: `lib/accounting/loans.test.ts` (100 %), extended `distribution.test.ts`, `owners.test.ts`, `permissions.test.ts`.
- Integration (vitest + `barihishab_test`): `tests/integration/api/loans.test.ts` (extended), `loan-repayments.test.ts`, `loan-corrections.test.ts` (void/cancel/write-off), `advances.test.ts` (extended: GET, OWNER_OWED, multiplier), `advance-standing.test.ts`, `advance-limit-settings.test.ts`, plus updates to `period-close`, `period-reopen`, `fund-balance-ledger`, `transactions-correct-void`, `openapi`, `security-fixes` (permissions) tests. `tests/helpers/factory.ts → createLoan` default `disbursedOn` moves to `2026-06-10` so October still deducts.
- Components: `components/loans/*.test.tsx` (role-aware actions, hints, validation messages).
- E2E: `e2e/payments-loans.spec.ts` — sorts after `owners.spec.ts` (needs its owners) and before `period-distribution.spec.ts`; it must leave no ACTIVE loan and no balance change (loans cancelled or repaid in cash, advances voided) so later specs see the same numbers.

## Risks / Trade-offs

- [Instalment timing change alters existing close results for loans disbursed in the month being closed] → PRD §7.3 mandates it; fixtures move the disbursement to June; spec scenario covers it.
- [Backfilled `origin = CLOSE` marks any hand-made LOAN_DEDUCTION before this change as close-posted] → none can exist: manual deductions didn't exist before this change.
- [Historical split advances show "Direct"] → accepted; dev data only.
- [Write-off expense edited from Entries would break the fund offset] → locked by `NOT_EDITABLE` and hidden actions.
- [Advance FIFO status computed per request over the owner's full ledger] → fine at one house × few owners; it's one query per owners set, grouped in memory.
- [e2e specs share one DB in alphabetical order] → the new spec cleans up after itself and is placed between `owners` and `period-distribution`.

## Migration Plan

1. One Prisma migration `advances_loans`: enum additions (`LoanStatus.CANCELLED`, `TxnSource.LOAN_WRITE_OFF`, new `EntryOrigin`, `LoanMovementType`), new columns with defaults, backfills (numbers, origins), `NOT NULL` + unique index on `loans.number`, `loan_movements` table + triggers + checks, `LOAN_WRITTEN_OFF` category insert for every property (`ON CONFLICT DO NOTHING`).
2. Apply with `prisma migrate deploy` to the shared dev DB (`barihishab`) — never `migrate dev` reset there (other worktrees).
3. Rollback: the migration is additive; reverting the code leaves unused columns/table harmless. Enum values can't be dropped in Postgres, so a rollback keeps them.
