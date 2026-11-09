## 1. Setup

- [x] 1.1 Confirm `add-owners` is archived (or archive it) so the `loans`, `master-data`, `owners-ui`, `rbac` deltas apply on top of it; run the full suite once to record the green baseline (`pnpm test`, integration, `pnpm e2e`)
- [x] 1.2 Read `node_modules/next/dist/docs/` for route handlers with dynamic `params` (Promise), `page.md` `searchParams`, `notFound()`, `connection()` + Cache Components; read `.agents/skills/barihisab-design-system/SKILL.md` and `.agents/skills/tdd`

## 2. Permissions, errors, audit actions (`rbac`)

- [x] 2.1 Write failing tests in `lib/permissions.test.ts`: Super Admin 35 keys, Owner exactly 8 (adds `distribution.view`), Owner lacks `period.close`, `period.reopen`, `reserve.override`, `loan.manage`
- [x] 2.2 Add the 5 keys to `lib/permissions.ts`; make 2.1 pass
- [x] 2.3 Write failing tests in `lib/api/errors.test.ts` for `CLOSE_BLOCKED`, `PREVIOUS_MONTH_OPEN`, `PERIOD_ALREADY_CLOSED`, `PERIOD_CHANGED`, `REOPEN_NOT_ALLOWED`, `LOAN_NOT_ACTIVE` (409, bn + en, Distribution PRD §9 wording)
- [x] 2.4 Add the error codes; add audit actions `period.closed`, `period.reopened`, `period.reserve_overridden`, `period.reserve_reset`, `settings.reserve_updated`, `loan.updated`; make 2.3 pass

## 3. Pure distribution module (`lib/accounting/distribution.ts`)

- [x] 3.1 Write failing tests `lib/accounting/distribution.test.ts`: `reserveFor` (OFF, 5 % of 8902000 → 445100, half-up 8902050 → 445100, FIXED capped, override capped, surplus ≤ 0 → 0); `staircase` (§11.1 October, §11.2 April → May, TC-05 10 % → 7200000); `allocate` (1:1:1 of 100000 → 33334/33333/33333, 40:25:15:10:10 of 8456900, 0 distributable, 0-unit owner, tie by order, Σ = distributable property test over random inputs)
- [x] 3.2 Add failing tests: `loanDeductions` (TC-08, capped by entitlement, capped by outstanding → REPAID flag, skipped at 0, two loans oldest first share the free entitlement); `boardRows` (opening/received/advance/other, same-month void pair cancels, cross-month reversal → Other, 0-unit owner with activity included, open-month after-close, totals); `closeChecks` (each must-pass + each warning); `diffSnapshots` (§6.3 missed bill: Expense +500000, Reserve −25000, Distributable −475000, per-owner diffs, unchanged lines omitted)
- [x] 3.3 Implement `lib/accounting/distribution.ts`; confirm 100 % coverage with `pnpm test:coverage`

## 4. Data model & migration

- [x] 4.1 Write failing tests `tests/integration/db/distribution-schema.test.ts`: `reserve_override_paisa < 0` refused, override amount without reason refused, `period_reopens` DELETE raises, `loans.installment_paisa = 0` refused, LOAN_DEDUCTION without `loan_id` or with positive amount refused, ENTITLEMENT insert into a CLOSED period still raises `PERIOD_CLOSED`
- [x] 4.2 Prisma: `Period` + `reopenCount`, `snapshot Json?`, `reserveOverridePaisa BigInt?`, `reserveOverrideReason String?`; new `PeriodReopen`; `Loan.installmentPaisa BigInt?`; `OwnerLedgerEntry.loanId` + relation (design D1)
- [x] 4.3 `prisma migrate dev --create-only --name distribution`; append CHECKs and the `financial_no_delete()` trigger + `REVOKE DELETE` on `period_reopens`; apply + `prisma generate`
- [x] 4.4 Add `period_reopens` to `tests/helpers/db.ts` TRUNCATE; extend `tests/helpers/factory.ts` (`closeMonthDirect`, loan with instalment, reserve rule); make 4.1 pass

## 5. Loans and fund balance (`loans`, `master-data`)

- [x] 5.1 Write failing tests: `tests/integration/api/loans.test.ts` (PATCH instalment 200 + audit, above outstanding 422, non-ACTIVE 409, Owner 403, unknown 404; outstanding = principal − deductions); `payouts.test.ts` (`loanInstallmentPaisa` saved, > excess → 422); `fund-balance-ledger.test.ts` (REPAID loan keeps the fund balance)
- [x] 5.2 `fundMovements()` sums principal of loans of every status; `loanOutstandingByOwner` = principal − Σ non-voided LOAN_DEDUCTION by `loan_id` over ACTIVE loans; add `setLoanInstallment`, `activeLoansWithOutstanding`; `createPayout` passes `loanInstallmentPaisa` into `createLoanInTx`
- [x] 5.3 `app/api/v1/loans/[id]/route.ts` + `schema.ts` (PATCH); extend `app/api/v1/payouts/schema.ts`; make 5.1 and the existing owners/payouts/fund tests pass

## 6. Reserve (`reserve`)

- [x] 6.1 Write failing tests `tests/integration/api/reserve.test.ts`: GET/PUT `/settings/reserve` (save 5 %, invalid percent 422, Owner 403, audit before/after); PUT `/periods/{month}/reserve` (override + reason, reset with null, CLOSED month 409, no reason 422, Owner 403, audit); reserve balance scenario (0 + 491100 + 445100 − 300000 = 636200)
- [x] 6.2 Implement `lib/distribution/reserve-service.ts` (rule zod schema in `Property.settings.reserve`, `readReserveRule`, `saveReserveRule`, `setReserveOverride`, `reserveBalance`)
- [x] 6.3 Routes `app/api/v1/settings/reserve/{route,schema}.ts` and `app/api/v1/periods/[month]/reserve/{route,schema}.ts`; make 6.1 pass

## 7. Distribution read model (`distribution`)

- [x] 7.1 Write failing tests `tests/integration/api/distribution.test.ts`: October preview staircase + 5 board rows match §11.1 (entitlements, after close, Tanvir loan ded. 500000); default month = oldest open; `mustCloseFirst`; deficit carry across an open previous month; voided / reserve-paid excluded; 0-unit owner with payout listed; closed month reads snapshot after the rule changes; closed month without snapshot; `paidAfterClose`; Owner allowed; anonymous 401; unknown month 404; bad month 422; no periods → `month: null`
- [x] 7.2 Implement `lib/distribution/month-data.ts` (single-pass loaders, no N+1) and `lib/distribution/distribution-service.ts` (`getDistribution`, previous-deficit walk per design D4, snapshot zod schema)
- [x] 7.3 Route `app/api/v1/distribution/{route,schema}.ts` (`await connection()`); make 7.1 pass

## 8. Close and reopen (`month-close`)

- [x] 8.1 Write failing tests `tests/integration/api/period-close.test.ts`: close-preview checks/warnings/what-happens (unpaid Flat 3A, no income, missing bills, month not over, reserve negative, skipped instalment, next month opens); Owner 403 on preview and close; normal close posts 5 ENTITLEMENT (Σ 8456900, dated last day) + LOAN_DEDUCTION, snapshot, CLOSED, next month OPEN, audit; zero-distributable close; shares missing → `CLOSE_BLOCKED` with nothing written; out of order → `PREVIOUS_MONTH_OPEN`; stale version → `PERIOD_CHANGED`; two concurrent closes → one 200 + one `PERIOD_ALREADY_CLOSED` with name and exactly 5 entitlements; expense into closed month → `PERIOD_CLOSED`; opening set after close → `OPENING_LOCKED`; loan paid off → REPAID and fund unchanged
- [x] 8.2 Write failing tests `tests/integration/api/period-reopen.test.ts`: reopen latest → OPEN, `reopenCount` 1, voided originals + REVERSALs, balances restored, REPAID loan ACTIVE again, history row with reason, audit; older month → `REOPEN_NOT_ALLOWED`; blank reason 422; Owner 403; payouts after close stay; re-close shows before → after changes (§6.3) and history on the closed record
- [x] 8.3 Implement `lib/distribution/close-service.ts` (`getClosePreview`, `closeMonth`, `reopenMonth`) per design D6 with `inTransaction(…, { timeout: 15000 })`
- [x] 8.4 Routes `app/api/v1/periods/[month]/close-preview`, `close`, `reopen` (`route.ts` + `schema.ts`); make 8.1 and 8.2 pass

## 9. Swagger

- [x] 9.1 Import every new `schema.ts` in `app/api/v1/openapi.ts`; extend `tests/integration/api/openapi.test.ts` to assert all 8 new operations (and `loanInstallmentPaisa` on `/payouts`); regenerate and verify `/api/v1/openapi.json` and the Swagger UI

## 10. i18n and shared UI pieces

- [x] 10.1 Add `dist.*`, nav, settings-reserve and home-reminder strings to `lib/i18n/en.ts` and `bn.ts` using the PRD §9 wording; key-parity test stays green

## 11. Distribution page (`distribution-ui`)

- [x] 11.1 Write failing UI tests `components/distribution/distribution.test.tsx` (fixtures from §11.1): header open/closed sub-lines + reopened N×; staircase cells, deficit / reserve-paid / override notes; board columns, "(preview)", "after close", "You" tag, Other only when non-zero, totals row; mobile cards same numbers; footer text; Owner sees no Close / Reopen / override / Pay; "Close {Month} first" link; close dialog disables Close & lock on a failed check and shows warnings + what happens + changes table; reopen dialog requires reason and lists paid-after-close; reserve override dialog
- [x] 11.2 `app/[lang]/(app)/distribution/page.tsx` (Server Component, `requirePagePermission('distribution.view')`, `searchParams` month, `notFound()`, admin pay data in `Promise.all`) + `generateMetadata`
- [x] 11.3 Components `components/distribution/{DistributionView,Staircase,OwnerBoard,AccuracyFooter,CloseMonthDialog,ReopenDialog,ReserveOverrideDialog,ChangesTable}.tsx` per design D9 and the design system (ruled cells, one yellow Distributable fill, zero radius, labelled colours); make 11.1 pass
- [x] 11.4 Pay from the board: adapter from board row + funds to `PayDrawer` data; refresh on save
- [x] 11.5 `ShellNav` "Distribution" item after Entries (`distribution.view`); update `components/app/shell.test.tsx`

## 12. Home, Settings, Owners screens

- [x] 12.1 Write failing tests: Home strip for `period.close` users when an earlier month is open (text, unpaid units, link) and absent for Owners / when only the current month is open; Settings Reserve section (Off / Percent / Fixed, starting reserve, balance, save); PayDrawer excess-as-loan instalment field; owner detail active loans with instalment, edit control only with `loan.manage`
- [x] 12.2 Server-side reminder data in `app/[lang]/(app)/page.tsx` + `HomeDesk` strip
- [x] 12.3 Settings page gate adds `settings.manage`; `SettingsView` Reserve section calling `/settings/reserve`
- [x] 12.4 `PayDrawer` instalment field; `OwnerDetail` loans list + instalment dialog calling `PATCH /loans/{id}`; owner detail data includes active loans; make 12.1 pass

## 13. Seed

- [x] 13.1 Demo seed (`SEED_DEMO=true`): reserve rule 5 % (the demo seed creates no loans, so no instalment is seeded); update `tests/integration/scripts/seed.test.ts`

## 14. End-to-end (Playwright)

- [x] 14.1 Write `e2e/period-distribution.spec.ts` (serial; named to sort after `owners.spec.ts`): admin sets reserve 5 % in Settings; opens Distribution → staircase + board preview, footer balanced; overrides and resets the reserve; Close month dialog shows checks and warnings → Close & lock → toast, closed view, entitlements visible on an owner statement, next month exists; second close via API refused; expense into the closed month refused; Pay from board settles a row; Reopen with reason → reversals, reopened note; re-close shows changes; Owner login sees board with "You" and no controls, API close/reopen → 403; `/bn/distribution` at 360px renders cards with Bangla digits and no horizontal scroll
- [x] 14.2 Add the Distribution page to `e2e/visual.spec.ts` 360px checks; make sure `income-expenses.spec.ts` and `owners.spec.ts` still pass when run before it

## 15. Verify

- [x] 15.1 `pnpm lint`, `pnpm typecheck`, `pnpm build`, unit + UI + integration + e2e suites all green; 100 % coverage on `lib/accounting/**`
- [x] 15.2 Manual check on the dev server ($CONDUCTOR_PORT) as admin and owner, desktop and 360px, en and bn; `openspec validate add-distribution --strict`
