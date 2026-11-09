## Context

See proposal.md (Why). Distribution sits on top of the shipped Income & Expenses and Owners modules and reuses their plumbing unchanged:

- **API layering**: thin `route.ts` (`withAuth(handler, { permission })` → `readJson`/`parse` → service → `ok()`/`failResponse()`), `schema.ts` (zod 4 + `registry.registerPath`, imported in `app/api/v1/openapi.ts`), services in `lib/<module>/` returning `Result<T>`, `inTransaction()` + `Abort`, `audit(tx, …)` in the same transaction.
- **Periods**: `periods` rows (`OPEN`/`CLOSED`, `closed_at`, `closed_by` already exist), `ensureCurrentPeriod()`, `lockPeriod()` (`FOR SHARE`, taken by every income/expense and owner-ledger write). DB triggers `block_closed_period()` on `house_transactions` and `block_closed_period_ledger()` on `owner_ledger_entries` (allows a void-columns-only UPDATE) already refuse writes into CLOSED months, so **closing = setting status CLOSED**; LCK-01 and `OPENING_LOCKED` become live automatically.
- **Totals**: `toPeriodTotals()` in `lib/accounting/totals.ts` already splits income / expense / reserve-paid from one `groupBy(kind, fromReserve)`.
- **Owners**: `setInForce()`, `totalUnits()`, `balanceLabel()` in `lib/accounting/owners.ts`; `balancesByOwner()`, `loanOutstandingByOwner()`; `OwnerLedgerEntry` with `LedgerType` already including `ENTITLEMENT` and `LOAN_DEDUCTION`; `PayDrawer` takes `OwnerPageData`.
- **Pages**: Server Components under `app/[lang]/(app)/…` inside `<Suspense>` (`cacheComponents: true`), services called directly; client components mutate via `useApiMutation` (TanStack Query) then `router.refresh()`.
- `Property.settings` is a JSONB column that is still `{}`; no reserve setting exists. `Loan` has no instalment; `fundMovements()` subtracts ACTIVE loans only.

## Goals / Non-Goals

**Goals:**
- One pure module `lib/accounting/distribution.ts` holds every formula (100 % coverage); services fetch rows, call it, and write.
- Open month = computed preview; closed month = snapshot only. The same code computes the preview and the values posted on close, so preview and posted numbers cannot drift.
- Close and reopen are single transactions guarded by a row lock and a version.

**Non-Goals:**
- Stored balances, SQL views, a generic period state machine, background jobs (P2 emails / reminders).
- A loan ledger table (`loan_movements` in PRD §9.3) — deductions live in the owner ledger linked by `loan_id` until the Loans section adds cash repayments.

## Decisions

### D1. Data model (migration `distribution`)

| Change | Columns |
| --- | --- |
| `periods` | `reopen_count INT NOT NULL DEFAULT 0`, `snapshot JSONB NULL` (set on close, kept on reopen until the next close overwrites it), `reserve_override_paisa BIGINT NULL` (CHECK ≥ 0), `reserve_override_reason TEXT NULL` (CHECK both null or both set) |
| new `period_reopens` | `id`, `property_id`, `period_id`, `reason`, `reopened_by`, `reopened_at`, `snapshot_before JSONB NOT NULL`; index `(period_id, reopened_at)`; `financial_no_delete()` trigger |
| `loans` | `installment_paisa BIGINT NULL` (CHECK > 0) |
| `owner_ledger_entries` | `loan_id UUID NULL` FK → loans; CHECK `type = 'LOAN_DEDUCTION' → loan_id IS NOT NULL AND amount_paisa < 0` |

Snapshot JSON (paisa as JS numbers, < 2^53): `{ incomePaisa, expensePaisa, reserveSpentPaisa, reservePaisa, reserveSource: 'RULE'|'OVERRIDE', reserveRule, overrideReason, previousDeficitPaisa, previousDeficitMonth, distributablePaisa, deficitCarriedPaisa, shares: [{ ownerId, name, units }], entitlements: [{ ownerId, amountPaisa }], loanDeductions: [{ ownerId, loanId, amountPaisa }] }`, parsed with a zod schema on read.

*Why JSONB snapshot (PRD §9.3 `periods.snapshot`) over separate snapshot tables:* the snapshot is read whole and never queried by field; the PRD names it. *Why `period_reopens` (deviation: PRD only has `reopen_count`):* G7/F15 need reopen history with reason and who, and F8 needs the snapshot before each reopen; audit rows exist but are not a read model.

*Why `loan_id` on the ledger instead of `loan_movements`:* PRD §9.3 links deductions through `loan_movements.owner_ledger_entry_id`. With no cash repayments yet, the ledger row alone is the movement; outstanding = principal − Σ |non-voided LOAN_DEDUCTION by loan_id|. The Loans section can add `loan_movements` for cash repayments without migrating these rows. *Deviation noted.*

### D2. Reserve rule storage

`Property.settings.reserve = { mode: 'OFF'|'PERCENT'|'FIXED', percentBp?: int, fixedPaisa?: int, startingPaisa: int }`, validated by one zod schema shared by the route and the reader (`readReserveRule(settings)` defaults to OFF). Percent in basis points so 2.5 % is exact without floats. *Alternative:* a `property_settings` table — rejected; PRD §9.3 already specifies the JSONB, and only one rule exists.

### D3. Pure module `lib/accounting/distribution.ts`

- `reserveFor(surplus, rule, override)` — 0 if surplus ≤ 0; override → min(override, surplus); PERCENT → `floor((surplus × bp + 500000) / 1000000) × 100` in BigInt (half-up to whole taka, no floats); FIXED → min.
- `staircase({ income, expense, reserveSpent, previousDeficit, rule, override })` → `{ …, surplus, reserve, net, distributable, deficitCarried }`.
- `allocate(distributable, holders: { ownerId, units }[] in display order)` → largest remainder using integer math (`distributable * units` as BigInt to avoid overflow, remainder compare, ties by index).
- `loanDeductions(entitlements, loans sorted by disbursedOn)` → `{ deductions, skipped }` per §7.5.
- `boardRows(owners, entries, …)` — classifies the month's entries into columns, cancels same-month void pairs, computes Opening / Balance / After close and totals.
- `closeChecks(input)` → `{ mustPass[], warnings[] }`; `diffSnapshots(before, after)` → changed staircase lines + per-owner old / new / diff.

### D4. Previous deficit for open months

`previousDeficit(month)` walks back to the latest CLOSED period (its `snapshot.deficitCarriedPaisa`) and then forward through the open months in between computing each staircase live. Open months are few (normally 1–2), so this is ≤ 2 extra `groupBy`s. *Alternative:* store a running deficit — rejected (balances computed, never stored).

### D5. Services (`lib/distribution/`)

- `month-data.ts` — loads one month's inputs with no N+1: period + override, `groupBy(kind, fromReserve)` totals, share sets (`loadShareSets`), owners, ledger entries for the month + `groupBy(ownerId)` sums before the month and overall, ACTIVE loans with Σ deductions (`groupBy(loanId)`), reserve rule. `Promise.all` outside transactions; sequential inside (one connection).
- `distribution-service.ts` — `getDistribution(propertyId, month|null, viewerId)` (preview or snapshot), `getClosePreview(propertyId, month)`, `reserveBalance(db, propertyId)`.
- `close-service.ts` — `closeMonth(propertyId, month, version, actor)` and `reopenMonth(propertyId, month, reason, actor)`.
- `reserve-service.ts` — `getReserveSettings`, `saveReserveRule`, `setReserveOverride`.
- `loan-service.ts` (existing) gains `outstandingByLoan`, `setInstallment`, `activeLoansWithOutstanding`; `loanOutstandingByOwner` switches to principal − deductions.

### D6. Close and reopen transactions

Close and reopen first take a per-property advisory lock (`period_close:{propertyId}`) so they never interleave across months (a close of November and a reopen of October each check the other month). Close: `SELECT … FROM periods WHERE id = $1 FOR UPDATE` (waits for in-flight `FOR SHARE` writers, so no income/payout lands mid-close) → re-check status OPEN, `reopen_count = version`, earlier periods all CLOSED → take the `share_set:{propertyId}:{month}` advisory lock that saving a share set uses (no set lands mid-close) → lock ACTIVE loans of the property `FOR UPDATE` → load month data with `tx` → compute (D3) → if any must-pass fails `Abort(CLOSE_BLOCKED)` → `createMany` ENTITLEMENT + LOAN_DEDUCTION (no note text: the type is the label, so statements translate it) → loans whose outstanding hits 0 → REPAID → `UPDATE periods SET status='CLOSED', closed_at, closed_by, snapshot` → `INSERT next month ON CONFLICT DO NOTHING` → audit. Entries are inserted *before* the status flips, so the closed-period trigger stays untouched. Timeout raised to 15 s (`inTransaction(…, { timeout })`).

Reopen: lock period `FOR UPDATE` → check CLOSED, no later CLOSED period → `UPDATE periods SET status='OPEN', reopen_count+1` (first, so the ledger trigger allows the reversal inserts) → insert `period_reopens` with `snapshot_before = snapshot` → for each non-voided ENTITLEMENT / LOAN_DEDUCTION in the month: set void columns + insert REVERSAL (same month, same `loan_id`, `reverses_id`) → loans with outstanding > 0 and status REPAID → ACTIVE → audit. `closed_at`/`closed_by` are kept until the next close (needed for "paid after close").

Concurrency answer for G12: a second close blocks on `FOR UPDATE`, then sees CLOSED and returns `PERIOD_ALREADY_CLOSED` with `closed_by`'s name; a stale dialog after a reopen sends an old `reopenCount` → `PERIOD_CHANGED`. No idempotency keys needed: the version makes close naturally idempotent-safe.

### D7. Board semantics

Open month: Balance = current overall balance ("Balance now", what Pay uses), After close = balance now + preview entitlement − preview deduction (matches PRD §11.1). Closed month: Balance = Σ entries with period ≤ month. Entitlement column for a closed month comes from the snapshot (equal to the posted non-voided ENTITLEMENT rows). "Paid after close" = PAYOUT/ADVANCE rows with `created_at > closed_at` (any month).

### D8. Routes (all with `schema.ts`, registered in Swagger)

| Route | Method | Permission |
| --- | --- | --- |
| `distribution` | GET `?month=` | `distribution.view` |
| `periods/[month]/close-preview` | GET | `period.close` |
| `periods/[month]/close` | POST `{ reopenCount }` | `period.close` |
| `periods/[month]/reopen` | POST `{ reason }` | `period.reopen` |
| `periods/[month]/reserve` | PUT `{ amountPaisa \| null, reason? }` | `reserve.override` |
| `settings/reserve` | GET, PUT | `settings.manage` |
| `loans/[id]` | PATCH `{ installmentPaisa \| null }` | `loan.manage` |

`[month]` is a `YYYY-MM` path segment validated with `MonthKeySchema` (422 otherwise). New error codes (bn + en): `CLOSE_BLOCKED`, `PREVIOUS_MONTH_OPEN`, `PERIOD_ALREADY_CLOSED`, `PERIOD_CHANGED`, `REOPEN_NOT_ALLOWED`, `LOAN_NOT_ACTIVE` (all 409). New audit actions: `period.closed`, `period.reopened`, `period.reserve_overridden`, `period.reserve_reset`, `settings.reserve_updated`, `loan.updated`. `POST /payouts` schema gains optional `loanInstallmentPaisa`.

### D9. UI

- `app/[lang]/(app)/distribution/page.tsx` — Server Component, `requirePagePermission('distribution.view')`, `searchParams` Promise → `getDistribution`; for admins also `listFunds` + page data the pay drawer needs. `notFound()` for unknown month.
- `components/distribution/`: `DistributionView` (header, month nav via `router.replace`), `Staircase`, `OwnerBoard` (table ≥ md, cards < md, same row DTO), `AccuracyFooter`, `CloseMonthDialog` (fetches close-preview with `useQuery`, posts via `useApiMutation`), `ReopenDialog` (built on `confirm-dialog` + reason field), `ReserveOverrideDialog`, `ChangesTable`. Pay reuses `components/owners/PayDrawer.tsx` by building its `OwnerPageData` from the board row + funds (small adapter, no PayDrawer refactor beyond the loan-instalment field).
- `ShellNav` adds `{ href: "/distribution", icon: ScaleIcon, permission: "distribution.view" }` after Entries. `HomeDesk` gets an optional `closeReminder` prop computed on the server (oldest open month < current month, unpaid units). `SettingsView` gets a Reserve section; the settings page gate adds `settings.manage`.
- Strings in `lib/i18n/{en,bn}.ts` under `dist.*`; money via existing `formatMoney`.

### D10. Testing

- Unit: `lib/accounting/distribution.test.ts` (PRD §11 examples, TC-05, TC-08, rounding, override cap, deficit chain, loan cap/skip/order, board void pairs, diff, checks) at 100 %; `permissions.test.ts` (35/8); `errors.test.ts`.
- Integration: `tests/integration/api/distribution.test.ts`, `period-close.test.ts` (incl. concurrent close, out of order, lock), `period-reopen.test.ts`, `reserve.test.ts`, `loans.test.ts`; `fund-balance-ledger.test.ts` (REPAID keeps fund); `tests/integration/db/distribution-schema.test.ts`; `openapi.test.ts`. Existing suites run unchanged.
- UI (jsdom): `components/distribution/distribution.test.tsx`.
- E2E: `e2e/distribution.spec.ts` (serial, after `owners.spec.ts`).

## Risks / Trade-offs

- [Existing tests/e2e that write into old months may now hit CLOSED months] → nothing closes a month except the new endpoint; existing suites never call it. E2E distribution spec runs last and closes only its own months.
- [Close locks the period `FOR UPDATE` while computing] → writers wait at most the close duration (one month of rows); 15 s timeout.
- [Mobile nav grows to 8 cells for Super Admin] → labels already truncate; verify at 360px in E2E; fallback is moving Profile into the avatar (out of scope).
- [A CLOSED month without a snapshot (closed directly in the DB by existing e2e helpers `setPeriodStatus`, or before this change)] → read model treats it as a snapshot of zeros with entitlements taken from posted ENTITLEMENT rows, Deficit carried 0; reopen of such a month is allowed and simply reverses whatever was posted.
- [JSON snapshot schema drift] → zod-parsed with a `v: 1` field; future fields optional.
- [`fundMovements` change from ACTIVE-only to all loans] → no WRITTEN_OFF/REPAID loans exist before this change, so balances are unchanged at deploy; covered by a test.
- [Percent × surplus overflow] → surplus capped by CHECKs (|amount| ≤ 10^9 per entry) but sums can exceed; use BigInt in `reserveFor` and `allocate` products.

## Migration Plan

1. Archive `add-owners` first (its deltas are the base for `loans`, `master-data`, `owners-ui`, `rbac`).
2. `prisma migrate dev --create-only --name distribution`, append CHECKs / triggers (D1), apply, `prisma generate`; add `period_reopens` to `tests/helpers/db.ts` TRUNCATE.
3. Seed (`SEED_DEMO=true`): reserve rule 5 % (demo seed has no loans); no months closed by the seed.
4. Rollback: migration only adds columns/tables; dropping them restores the old schema. Months closed meanwhile would need their entitlements reversed by a reopen first.
