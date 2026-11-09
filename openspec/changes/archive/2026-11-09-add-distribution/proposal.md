## Why

Income & Expenses and Owners are live, but nothing turns a month's house money into each owner's share: entitlements are always ৳0, months never close, closed-month locking (LCK-01) and opening-balance locking are dormant, and loans can't be repaid from entitlements. Distribution (docs/distribution_section_PRD.md v1.0, main PRD §5.1–5.3, DST-01–DST-05) is the step that makes balances real, so it comes next.

## What Changes

- **Distribution read model** — `GET /api/v1/distribution?month=YYYY-MM`: month status header (F1), staircase Income − Expense − Reserve − Previous deficit = Distributable with notes (F2, §7.1), owner board with Share, Opening, Entitlement, Received, Advance, Loan ded., Other, Balance / after close, Loan, totals row (F3, G8, G10, G13, §7.3), accuracy footer Σ entitlements = distributable, shares used, rounding note (F4). Open months compute a live **preview**; closed months read only the **snapshot** (G11, F15, Rule 6). No month → oldest open month.
- **Pure distribution math** — `lib/accounting/distribution.ts` (100 % coverage): staircase, reserve rule (Off / Percent → whole taka / Fixed ≤ surplus; override), deficit carry (F10), largest-remainder entitlements in paisa with ties by display order (§7.2, §11.3), loan instalment = min(instalment, outstanding, free entitlement) (G4, §7.5), board row aggregation, before → after diff (G6), close checklist (G1, G2).
- **Close month** — `GET /api/v1/periods/{month}/close-preview` (checklist must-pass vs warnings, "What happens", changes since last close) and `POST /api/v1/periods/{month}/close`: in one transaction post one ENTITLEMENT per owner with units (dated last day of month), LOAN_DEDUCTION entries (loans reaching 0 → REPAID), the snapshot, CLOSED status (locks income/expenses and owner ledger via the existing triggers), reserve kept, next month opened, audit `period.closed`. Months close in order; second concurrent close refused `409 PERIOD_ALREADY_CLOSED` naming who closed it (F5, F6, F11, G12; DST-02, DST-03; Rules 1, 4, 5, 11).
- **Reopen** — `POST /api/v1/periods/{month}/reopen { reason }`: latest closed month only; voids each ENTITLEMENT and LOAN_DEDUCTION and posts a REVERSAL for each, REPAID loans → ACTIVE, status OPEN, reopen count +1, reopen history row keeps the old snapshot; warns about payouts/advances recorded since the close (F7, G5, G7; DST-04; Rules 3, 13, 14).
- **Re-close before → after** — close preview and closed-month record show the staircase lines and per-owner entitlement that changed since the last close (F8, G6).
- **Reserve** — rule in property settings (`GET/PUT /api/v1/settings/reserve`, Off / Percent / Fixed + starting reserve) with Reserve section in Settings; per-month override `PUT /api/v1/periods/{month}/reserve` with reason, resettable; reserve balance = starting + Σ reserve of closed months − Σ reserve-paid expenses (F9, G3, §7.4; SET-02).
- **Loan instalments** — loans gain an optional monthly instalment (set when a payout excess becomes a loan, editable via `PATCH /api/v1/loans/{id}`); outstanding becomes principal − Σ loan deductions (F11; ADV-02 instalment part; main PRD TC-08).
- **UI** — `/[lang]/distribution?month=` page (header + month picker, staircase, desktop table + mobile cards, footer, Close / Reopen / Reserve override dialogs, Pay from board via the existing Owners pay drawer — F12), "Distribution" nav item, admin close-reminder strip on Home (F14 P1).
- **RBAC** — new keys `distribution.view` (Super Admin + Owner), `period.close`, `period.reopen`, `reserve.override`, `loan.manage` (Super Admin).
- **Fix** — fund balance subtracts the principal of every disbursed loan regardless of status (today only ACTIVE), otherwise a loan becoming REPAID through deductions would wrongly raise the fund.

PRD coverage: Distribution PRD F1–F12, F14 (P1 strip), F15; §7.1–7.5; Rules 1–16; §9 messages; §12 acceptance criteria. Main PRD DST-01–DST-05, SET-02 (reserve rule only), ADV-02 (instalment only), §5.1–5.3, TC-05, TC-08.

## Capabilities

### New Capabilities
- `distribution`: staircase, reserve rule application, deficit carry, entitlement allocation, owner board figures, accuracy footer, preview vs snapshot, the read endpoint.
- `month-close`: close checklist and preview, close transaction (entitlements, loan deductions, snapshot, lock, next month), reopen with reason and history, re-close before → after, ordering and concurrency rules.
- `reserve`: reserve rule setting, per-month override, reserve balance.
- `distribution-ui`: Distribution page, dialogs, Pay from board, nav item, Home close reminder, Settings reserve section.

### Modified Capabilities
- `rbac`: role → permission map gains 5 keys (Super Admin 35, Owner 8).
- `loans` (from `add-owners`): loans carry an optional monthly instalment; outstanding = principal − loan deductions; status follows outstanding.
- `master-data` (from `add-owners`): fund balance subtracts all disbursed loan principal, not only ACTIVE.
- `owners-ui` (from `add-owners`): excess-as-loan dialog takes an optional instalment; owner detail shows/edits a loan's instalment.

## Impact

- **Depends on** `add-owners` (complete, not yet archived): it should be archived before this change so the `loans`, `master-data`, `owners-ui` and `rbac` deltas apply on top of it.
- **DB** (migration `distribution`): `periods` + `reopen_count`, `snapshot JSONB`, `reserve_override_paisa`, `reserve_override_reason`; new `period_reopens` (no-delete trigger); `loans` + `installment_paisa`; `owner_ledger_entries` + `loan_id`; CHECKs.
- **Code**: `lib/accounting/distribution.ts`, `lib/distribution/*` services, `lib/periods/period-service.ts`, `lib/owners/loan-service.ts`, `lib/owners/ledger-service.ts` (payout loan instalment), `lib/master-data/fund-service.ts`, `lib/permissions.ts`, `lib/audit.ts`, `lib/api/errors.ts`, i18n.
- **API** (all `/api/v1`, all in Swagger): `GET /distribution`, `GET /periods/{month}/close-preview`, `POST /periods/{month}/close`, `POST /periods/{month}/reopen`, `PUT /periods/{month}/reserve`, `GET/PUT /settings/reserve`, `PATCH /loans/{id}`; `POST /payouts` accepts `loanInstallmentPaisa`.
- **UI**: `app/[lang]/(app)/distribution/page.tsx`, `components/distribution/**`, `ShellNav`, `HomeDesk`, `SettingsView`, `components/owners/PayDrawer.tsx`, `OwnerDetail.tsx`.
- **Tests**: Vitest unit (distribution math 100 %), integration per endpoint + DB schema, jsdom UI, Playwright `e2e/distribution.spec.ts`; existing suites must stay green.
- **No new dependencies.**

## Out of scope

- P2: Pay all owed (F13), email reminder on the 3rd (F14 P2), Months overview (F16), every §10 email (monthly report, reopen / re-close notices) — the close summary does not show the "Monthly email queued" line.
- P3: owner sign-off, multi-house, scheduled auto-close.
- Reports section: the "Monthly report" button is not shown until Reports exists; no Audit-log UI link (no audit screen yet).
- Home "House this month" staircase tile and the House Fund reconciliation tile (§7.6) — ledger ADJUSTMENT and OPENING have no fund effect, so the equation needs a reconciliation design of its own.
- Loan creation, cash repayment and loan voiding other than the automatic instalment (Advances & Loans section).
- Advance-limit and monthly-email settings (SET-02 advance limit, SET-03).
- Distribution PRD §14 open questions are answered with the PRD's current text: unpaid rent and early close are warnings, an instalment shortfall just waits, overrides and reopens need no second approval, every viewer sees every owner's row.
