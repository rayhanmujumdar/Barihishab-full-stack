## Why

Owners and Distribution already pay out advances and split payment excess into loans, but there is no place to see who borrowed what, why, and how much is still due — and a loan can only be repaid by the automatic instalment on close. The Advances & Loans PRD (`docs/advances_and_load_PRD.md`) turns the minimal `loans` table into a full loan ledger (cash and deduction repayments, voids, cancel, write-off) and adds the `/advances` screen (main PRD S7) so every owner can answer "how much do I still owe?" without asking.

## What Changes

- **Advances & loans screen** `/[lang]/advances` (S7): header with **+ Advance** / **+ New loan**, four summary tiles, tabs **Loans · Advances · By owner**, filters, loan cards with progress, loan detail sheet with movement and change history, all read-only for Owners. (F1–F3, F11, F13)
- **Direct loans** `POST /api/v1/loans`: sequential loan numbers L1, L2… per house (existing loans backfilled), Self tag, live hints (existing loan, payoff estimate, instalment above average share, fund short). (F4, G9, G10, G12, G15; ADV-01)
- **Repayments** `POST /api/v1/loans/{id}/repayments`: cash into the fund (House Fund +) or deduction from entitlement (owner balance −, capped at the positive balance); refuses more than the outstanding; loans reaching ৳0 become REPAID. (F5, G1, G2; ADV-02)
- **Corrections**: change instalment with a reason (F7, G3), void a cash or manual-deduction repayment by reversal (F8, G4), cancel a loan with no repayments (F9), write off a loan as a shared house expense (F10, P2).
- **Loan list/detail read API** `GET /api/v1/loans`, `GET /api/v1/loans/{id}` with outstanding, expected finish month, next deduction, source (Direct / From payment), movements incl. skipped instalments, and change history. (F2, F3, F6, §7.1, §7.2)
- **Advances**: `GET /api/v1/advances` history with Outstanding / Recovered in {month} / Void status (oldest first, §7.6), year totals excluding voids (G5); `GET /api/v1/advances/by-owner` standing per owner; owed-money warning on a new advance (G11). (F11–F13)
- **Advance limit setting** `GET/PUT /api/v1/settings/advance-limit` — 0.5× / 1× / 1.5× / 2× of the last-3-closed-months average (SET-02); the existing ADVANCE_OVER_LIMIT check uses it. (F14)
- **Loan statement print view** `/[lang]/loans/{id}/statement/print` (browser "Save as PDF", same approach as the owner statement). (F15, P2)
- **Month close**: instalments start the month **after** disbursement (§7.3); reopen reverses only close-posted deductions so manual deductions survive a reopen. (F6)
- **Fund balance** now adds cash repayments, cancellations and write-off offsets from the new loan movements. (§9.5 `v_fund_balance`)
- **BREAKING (internal client only)**: `PATCH /api/v1/loans/{id}` now requires `reason`; the Owners loan-instalment dialog is updated in the same change (see design D9).
- Navigation entry "Advances & loans"; owner detail links each loan to its detail and shows the advance-limit panel in the Record-advance drawer.

PRD coverage: Advances & Loans PRD F1–F15, G1–G15, §7.1–7.6, §8 rules 1–15, §9 messages, §12 acceptance criteria; main PRD ADV-01, ADV-02, SET-02 (advance limit), S7.

### Out of scope

- **F16 Requests link** and request badge — the Requests section (ADV-03–ADV-05) doesn't exist yet; `origin` leaves room for a `REQUEST` value later.
- **All §10 email notifications** (P2) — no new outbox templates; the Self tag and flags are stored so emails can be added later.
- Voiding an advance stays in the Owners statement (existing `POST /ledger/{id}/void`).
- P3 items: owner-proposed plans, interest/fees, repayment reminders.
- Open questions §14 keep the PRD's defaults: warn (not block) on a second loan, write-off is shared by all owners, one advance-limit multiplier for every owner, no double instalment after a skip, no extra approval for Self loans, no maximum loan amount.

## Capabilities

### New Capabilities
- `advances`: advance history with recovery status, advance totals, per-owner standing, and the advance-limit setting.
- `advances-loans-ui`: the `/advances` screen, loan/advance drawers, repayment/instalment/void/cancel/write-off dialogs, loan detail sheet and loan statement print view.

### Modified Capabilities
- `loans`: loan numbers, CANCELLED status, origin/Self/flag, direct creation, cash and deduction repayments, void, cancel, write-off, outstanding incl. cash, list/detail read API, expected finish; instalment change needs a reason.
- `owner-ledger`: entry `origin` (DIRECT / CLOSE / PAYOUT_SPLIT); advance limit uses the Settings multiplier; owed-money warning on advances.
- `month-close`: instalments only for loans disbursed before the month; reopen reverses only close-posted entries.
- `master-data`: fund balance includes loan cash movements; new system category "Loan written off".
- `house-transactions`: write-off expenses are locked against correct/void from Entries.
- `rbac`: new permissions `loan.view`, `loan.create`, `loan.repay` (Owner gets `loan.view`).
- `owners-ui`: instalment change asks for a reason; loans link to their detail; advance drawer shows the limit panel and owed warning.

## Impact

- **DB**: one migration — `LoanStatus` += `CANCELLED`; `loans` += `number`, `origin`, `is_self`, `flagged` (backfill numbers by creation order, origin `PAYOUT_SPLIT` for existing rows); new `loan_movements` table (cash repayment, reversal, cancel, write-off); `owner_ledger_entries` += `origin` (backfill ENTITLEMENT/LOAN_DEDUCTION → CLOSE); `TxnSource` += `LOAN_WRITE_OFF`; `LOAN_WRITTEN_OFF` category backfill. No-delete and closed-period triggers extended to `loan_movements`.
- **Code**: `lib/accounting/loans.ts` (new pure module), `lib/loans/*` services, `lib/owners/loan-service.ts` + `ledger-service.ts`, `lib/distribution/close-service.ts`, `lib/accounting/distribution.ts`, `lib/master-data/fund-service.ts`, `lib/transactions/transaction-service.ts`, `lib/permissions.ts`, `lib/i18n/{en,bn}.ts`, ShellNav, Settings, Owners detail.
- **API**: 9 new/changed endpoints under `/api/v1`, all registered in `app/api/v1/openapi.ts`.
- **Tests**: vitest unit (pure module 100 %), integration API tests per endpoint, component tests, Playwright `e2e/payments-loans.spec.ts`; existing distribution fixtures move the loan's disbursement to June so October still deducts.
