## 1. Setup

- [x] 1.1 Run the full suite once for the green baseline (`pnpm test`, `pnpm test:int`, `pnpm test:e2e`); note any pre-existing failures from the uncommitted attachment-proxy work so they aren't blamed on this change
- [x] 1.2 Read `node_modules/next/dist/docs/` for route handlers with Promise `params`, page `searchParams`, `connection()` + Cache Components; read `.agents/skills/barihisab-design-system/SKILL.md` and `.agents/skills/tdd`; re-read `docs/advances_and_load_PRD.md` §5–§9

## 2. Permissions and error codes (`rbac`)

- [x] 2.1 Write failing tests in `lib/permissions.test.ts`: Super Admin has 38 keys; Owner has exactly 9 (adds `loan.view`); Owner lacks `loan.create`, `loan.repay`, `loan.manage`
- [x] 2.2 Add `loan.view`, `loan.create`, `loan.repay` to `lib/permissions.ts` (Owner gets `loan.view`); make 2.1 pass
- [x] 2.3 Write failing tests in `lib/api/errors.test.ts` for `LOAN_HAS_REPAYMENTS` and `NOT_EDITABLE` (409, en + bn, PRD §9 wording)
- [x] 2.4 Add the error codes and audit actions `loan.repaid_cash`, `loan.repaid_deduction`, `loan.repayment_voided`, `loan.cancelled`, `loan.written_off`, `settings.advance_limit_updated`; make 2.3 pass

## 3. Pure accounting (`lib/accounting/loans.ts`, design D5)

- [x] 3.1 Write failing tests `lib/accounting/loans.test.ts`: `loanFigures` (L2 cash + deductions + void → 2500000 / 3500000, repaid split by cash/deduction, cancelled and written-off → 0); `expectedFinish` (L2 after October → 2027-04 next 500000 in 2026-11; new June loan → 2027-04 first 2026-07; 300000 instalment → 2027-08; manual → null; last partial instalment); `repaymentCap` (cash = outstanding; deduction = min(outstanding, max(0, balance))); `loanHistory` (running outstanding oldest first, void + reversal pairs, close deductions not voidable, skipped notes); `advanceStatuses` (Nasrin recovered in October, oldest first partial, never-negative advance recovered in its own month, voided → VOID, unattributed debit queued)
- [x] 3.2 Add failing tests in `lib/accounting/distribution.test.ts`: `loanDeductions` skips loans disbursed in or after the closed month and doesn't list them as skipped; in `lib/accounting/owners.test.ts`: `advanceLimit` with multiplier 50/100/150/200 and Nasrin's 3316253
- [x] 3.3 Implement `lib/accounting/loans.ts`, the `loanDeductions(month)` filter and the `advanceLimit` multiplier; confirm 100 % coverage with `pnpm test:coverage`

## 4. Data model and migration (design D1–D3, D6)

- [x] 4.1 Write failing tests `tests/integration/db/loans-schema.test.ts`: `DELETE FROM loan_movements` raises; insert into a CLOSED period raises `PERIOD_CLOSED`; `amount_paisa = 0` refused; duplicate `(property_id, number)` refused; backfill numbers existing loans 1..n by creation order with `origin = PAYOUT_SPLIT`; existing ENTITLEMENT/LOAN_DEDUCTION rows get `origin = CLOSE`; `LOAN_WRITTEN_OFF` category exists for every property
- [x] 4.2 Prisma schema: `LoanStatus.CANCELLED`; `TxnSource.LOAN_WRITE_OFF`; enums `EntryOrigin`, `LoanMovementType`; `Loan.number/origin/isSelf/flagged` + `@@unique([propertyId, number])`; `OwnerLedgerEntry.origin`; new `LoanMovement` model with relations
- [x] 4.3 `prisma migrate dev --create-only --name advances_loans`; hand-add backfills, `NOT NULL`, CHECKs, no-delete + closed-period triggers and `REVOKE DELETE` for `loan_movements`, the category insert (`ON CONFLICT DO NOTHING`); apply to `barihishab_test`, `prisma generate`
- [x] 4.4 Add `LOAN_WRITTEN_OFF` to `lib/master-data/defaults.ts` (`SYSTEM_CODES`, en/bn names); add `loan_movements` to `tests/helpers/db.ts` TRUNCATE; extend `tests/helpers/factory.ts` (`createLoan` gets `number`, default `disbursedOn` `2026-06-10`; `createLoanMovement`); update the default-categories test to 21 codes; make 4.1 pass

## 5. Loan service core (`loans`, `master-data`, design D4, D11)

- [x] 5.1 Write failing tests: `tests/integration/api/fund-balance-ledger.test.ts` (cash repayment + cancellation → 820000; write-off leaves Bank unchanged); `tests/integration/api/loans.test.ts` outstanding includes cash movements; `payouts.test.ts` split loan gets a number and `origin: PAYOUT_SPLIT`, split advance `origin: PAYOUT_SPLIT`
- [x] 5.2 Create `lib/loans/loan-service.ts` from `lib/owners/loan-service.ts` (outstanding from ledger + movements via `loanFigures`, `nextLoanNumber` under advisory lock, `lockLoan`); update importers (`ledger-service`, distribution `month-data` / `distribution-service`, `OwnerDetail`, `LoanInstalmentDialog`, tests); export `lockOwner`, `latestOpenPeriod`, `checkCashOut`, `cashWarnings`, `ownerBalance` from `ledger-service.ts`
- [x] 5.3 `fundMovements()` adds `−Σ loan_movements.amount` per fund account; `createPayout` sets `origin: PAYOUT_SPLIT` on the split advance; make 5.1 and existing owners/payouts/fund/distribution tests pass

## 6. Month close and reopen (`month-close`)

- [x] 6.1 Write failing tests in `tests/integration/api/period-close.test.ts`: loan disbursed in the closed month takes no instalment and isn't skipped; posted entries have `origin: CLOSE`; cap uses outstanding after a cash repayment. In `period-reopen.test.ts`: a manual deduction recorded before close survives the reopen; REPAID → ACTIVE still works
- [x] 6.2 Pass the month to `loanDeductions`; set `origin: CLOSE` in `postEntitlementsAndInstalments`; filter reopen by `origin: CLOSE`; make 6.1 and all existing distribution/close/reopen tests pass

## 7. Create and change loans (`loans` — Create a loan, Set a loan instalment, Loan list, Loan detail)

- [x] 7.1 Write failing tests `tests/integration/api/loans.test.ts`: POST 201 (bank −, balance unchanged, number, origin DIRECT, audit with reason); `OWNER_HAS_LOAN` → flagged; `INSTALMENT_ABOVE_SHARE`; fund warnings; isSelf; reason/reference/amount 422; instalment > amount 422; no open month 409; Owner 403; idempotent replay; PATCH requires reason (422), returns `expectedFinishMonth`, audit carries reason
- [x] 7.2 Write failing tests `tests/integration/api/loans-read.test.ts`: GET list newest first, `status`/`ownerId` filters, summary ignores filters, bad filter 422, Owner 200, anonymous 401; GET detail L2 history (disbursed + 4 close deductions, running outstanding, none voidable), skipped-instalment note from a snapshot, change history from audit, `PAYOUT_SPLIT` source, unknown 404
- [x] 7.3 Implement `createLoan`, `listLoans`, `loanDetail` and `setLoanInstallment(reason)` in `lib/loans/loan-service.ts`
- [x] 7.4 Routes: `app/api/v1/loans/{route,schema}.ts` (GET, POST with `withIdempotency`); extend `app/api/v1/loans/[id]/{route,schema}.ts` (GET; PATCH `reason`); make 7.1–7.2 pass

## 8. Repayments and corrections (`loans` — Record a repayment, Void, Cancel, Write off; `house-transactions`)

- [x] 8.1 Write failing tests `tests/integration/api/loan-repayments.test.ts`: cash (fund +, balance unchanged, audit); second repayment → REPAID; above outstanding 422 message; deduction within balance (balance −, funds unchanged, LOAN_DEDUCTION origin DIRECT); deduction above balance 422 message; cash needs fund/method, reference rules; non-ACTIVE 409; no open month 409; Owner 403; idempotent replay; concurrent repayments never exceed the outstanding
- [x] 8.2 Write failing tests `tests/integration/api/loan-corrections.test.ts`: void cash restores outstanding + fund + status ACTIVE; void manual deduction restores balance; close deduction 409 NOT_VOIDABLE; twice 409 ALREADY_VOIDED; concurrent voids → one reversal; foreign repayment id 404; cancel without repayments (fund back, CANCELLED, excluded from owner outstanding, number kept); cancel with repayment 409 `LOAN_HAS_REPAYMENTS`; write-off (WRITTEN_OFF, 0 outstanding, `LOAN_WRITTEN_OFF` expense in open month, funds unchanged, month surplus lower); write-off of REPAID 409; blank reasons 422; Owner 403 on all
- [x] 8.3 Write failing tests in `tests/integration/api/transactions-correct-void.test.ts` / `transactions-create.test.ts`: PATCH and void of a `LOAN_WRITE_OFF` expense → 409 `NOT_EDITABLE`; manual expense with `LOAN_WRITTEN_OFF` → 422
- [x] 8.4 Implement `recordRepayment`, `voidRepayment`, `cancelLoan`, `writeOffLoan` (lock owner → lock loan → lock open period → `repaymentCap` → insert → status → audit → idempotency)
- [x] 8.5 Guard `lib/transactions/transaction-service.ts` for `LOAN_WRITE_OFF` source and category
- [x] 8.6 Routes: `app/api/v1/loans/[id]/repayments/{route,schema}.ts`, `…/repayments/[repaymentId]/void/{route,schema}.ts`, `…/cancel/{route,schema}.ts`, `…/write-off/{route,schema}.ts`; make 8.1–8.3 pass

## 9. Advances (`advances`, `owner-ledger`)

- [x] 9.1 Write failing tests `tests/integration/api/advance-limit-settings.test.ts`: GET default 100; PUT 150 + audit; 120 → 422; Owner 403
- [x] 9.2 Extend `tests/integration/api/advances.test.ts`: multiplier applies; existing advance outstanding counts toward the limit; `OWNER_OWED` warning; reopened month's voided entitlement not double counted; GET list (newest first, filters, status OUTSTANDING/RECOVERED/VOID, Nasrin recovered in 2026-10, `paidInYearPaisa` excludes voids, `years`, Owner 200, bad year 422)
- [x] 9.3 Write failing tests `tests/integration/api/advance-standing.test.ts`: Tanvir row (3500000 / 1 loan, advance outstanding 200000, limit 1243595, 16 %), no closed months → null limit, last advance date ignores voided
- [x] 9.4 Implement `lib/loans/settings-service.ts` (advance limit in `properties.settings.advanceLimit`) and `lib/loans/advance-service.ts` (`advanceLimits`, `listAdvances`, `standingByOwner`); update `createAdvance` (multiplier, outstanding + amount rule, `OWNER_OWED`, non-voided entitlements)
- [x] 9.5 Routes: `app/api/v1/settings/advance-limit/{route,schema}.ts`; GET in `app/api/v1/advances/route.ts` + schema; `app/api/v1/advances/by-owner/{route,schema}.ts`; make 9.1–9.3 pass

## 10. OpenAPI

- [x] 10.1 Write failing tests in `tests/integration/api/openapi.test.ts`: every new path/method above is documented with tag "Advances & loans", `LoanBody`, `RepaymentBody`, `LoanDetail`, `AdvanceList`, `AdvanceLimitSettings` schemas exist; `/loans/{id}` PATCH requires `reason`
- [x] 10.2 Import every new `schema.ts` in `app/api/v1/openapi.ts`; verify `/api/v1/openapi.json` and the Swagger UI at `/api/v1/docs` render them

## 11. UI — screen, list and detail (`advances-loans-ui`)

- [x] 11.1 Add en + bn strings to `lib/i18n/{en,bn}.ts` (all §9 messages, tabs, tiles, movement types, statuses); i18n key-parity test passes
- [x] 11.2 Write failing component tests `components/loans/advances-loans.test.tsx`: tiles; Loans card text (repaid/left/expected/next); status tags as words; Owner sees no Record repayment / ⋯ / + buttons; empty states; Advances rows (Outstanding / Recovered in / Void struck through, Balance now sign word); By owner row; footer rule text with multiplier
- [x] 11.3 Add nav item "Advances & loans" (`loan.view`, heroicon) to `components/app/ShellNav.tsx`; update `components/app/shell.test.tsx`
- [x] 11.4 `app/[lang]/(app)/advances/page.tsx` (server; `searchParams` tab/owner/status/year/loan; Forbidden without `loan.view`; metadata) and `components/loans/{AdvancesLoansView,LoanCard,LoanDetailSheet,AdvancesTable,ByOwnerTable}.tsx` per the design system; make 11.2 pass

## 12. UI — drawers and dialogs

- [x] 12.1 Write failing component tests `components/loans/loan-forms.test.tsx`: New loan hints (existing loan, payoff months/finish, instalment above share, fund short), required reason/amount messages, reference required except Cash; Advance drawer limit panel + owed + over-limit warnings, "No limit yet — no closed months."; Repayment dialog defaults (instalment or outstanding), **Use full outstanding**, mode texts, deduction cap line, server 422 shown on amount; Change instalment preview of finish month + required reason; Void / Cancel / Write-off require a reason and show server errors
- [x] 12.2 Implement `components/loans/{LoanDrawer,AdvanceLimitPanel,RepaymentDialog,InstalmentDialog,LoanActionDialog}.tsx` (`useApiMutation`, one Idempotency-Key per open drawer, toasts, `router.refresh()`); make 12.1 pass
- [x] 12.3 Owners: `LoanInstalmentDialog` gets the required reason; owner detail shows loan number linking to `/advances?tab=loans&loan={id}`; `PayDrawer` advance mode shows `AdvanceLimitPanel` and the owed warning; update `components/owners/*.test.tsx`
- [x] 12.4 Settings: `components/settings/AdvanceLimitSettings.tsx` in `SettingsView` (`settings.manage`); update `components/settings/settings.test.tsx`
- [x] 12.5 Entries: hide Correct / Void for `LOAN_WRITE_OFF` entries in `DetailDrawer`; exclude `LOAN_WRITTEN_OFF` from the manual category picker; update `components/entries/drawers.test.tsx`

## 13. Loan statement print view

- [x] 13.1 Write failing component test `components/loans/print-loan-statement.test.tsx` (house, owner, loan no., reason, amount, instalment, movements with running outstanding, status, generated date, bn digits)
- [x] 13.2 `app/[lang]/(print)/loans/[id]/statement/print/page.tsx` + `components/loans/PrintLoanStatement.tsx` with `AutoPrint`; **Print statement** link in the detail sheet; make 13.1 pass

## 14. Playwright (`e2e/payments-loans.spec.ts`)

- [x] 14.1 Write the spec (runs after `owners.spec.ts`, before `period-distribution.spec.ts`): Owner & Admin see the nav entry; Admin creates a loan with instalment + reason (toast "Loan L{n} recorded…", tiles update, fund drops); second loan for the same owner shows the existing-loan hint; Record repayment cash → "Repayment recorded · ৳X left"; over-outstanding refusal + **Use full outstanding**; deduction above balance refusal; void the cash repayment from the detail sheet (struck through + Reversal); change instalment with reason updates "Expected to finish"; cancel a loan with repayments refused, then cancel the clean one; + Advance with limit panel/owed warning, row shows Outstanding; Advances tab filters and By owner tab; Owner sees everything read-only and gets 403 on POST `/loans` and `/loans/{id}/repayments`; বাংলা at 360 px has no sideways scroll; print view opens
- [x] 14.2 Cleanup inside the spec: every loan it created ends CANCELLED or REPAID by cash, the advance is voided from the owner statement, so owner balances, loan outstanding and fund balances equal their values before the spec
- [x] 14.3 Run the whole e2e suite (`pnpm test:e2e`) and confirm `period-distribution.spec.ts` and `visual.spec.ts` still pass unchanged

## 15. Verification

- [x] 15.1 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:coverage` (accounting modules 100 %), `pnpm test:int`, `pnpm test:e2e` — all green
- [ ] 15.2 Apply the migration to the shared dev DB with `prisma migrate deploy` (never a reset) and smoke-test `/en/advances` and `/bn/advances` on the running dev server as Super Admin and Owner; save screenshots in `.context/`
- [x] 15.3 Update auto-memory with the non-obvious decisions (loan_movements scope, `origin`, e2e spec placement) and mark this change ready to archive
