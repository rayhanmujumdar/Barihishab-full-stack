## Why

Every owner's share depends on the month's income and expenses, and today BariHisab has only auth and user management — there is no way to record a taka. This change delivers the Income & Expenses module (screen S3, entry drawer S4, entry detail, Generate rent, and the master data it needs) so the Super Admin can record a whole month from a phone, every owner can see each entry with its bill, and nothing in a closed month changes silently.

Source: `docs/income_expense_PRD.md` v1.0 (the user named this file; it refines `docs/barihishab_management_README.md` §5.1, §6.2–6.3, INC-01/02, EXP-01, SET-01). Phase **P1 only**.

## What Changes

- **Periods (minimal).** New `periods` table (one row per month, `OPEN` / `CLOSED`). The current Asia/Dhaka month opens on demand (first read or write) — PER-01. `GET /api/v1/periods`. A database trigger rejects any insert/update of `house_transactions` in a Closed period (LCK-01). Close/Reopen itself is **not** built here (Distribution PRD); tests and seed set `CLOSED` directly.
- **Master data.** Units (name, tenant, monthly rent, default fund account), Fund accounts (Cash/Bank/Wallet, opening balance, live balance), Income/Expense categories (bilingual names, system categories locked). Create / edit / deactivate — never delete (MST-01..03, EXP-02). Default categories seeded per property.
- **House transactions.** One table for income and expense, integer paisa only. Create (INC-01/02, EXP-01), list + per-month summary with tabs/counts/totals/category chips (LST-01..05), detail with attachments and history (DET-01), Correct with required reason (COR-01/02), Void with required reason (VOD-01/02), Adjustment and Arrear entries for Closed months (LCK-02), vendor autocomplete (EXP-03), soft warnings (INC-03, FND-01, DUP-02, date-far), `Idempotency-Key` on every create (DUP-01). OWNER_GRANT hidden from manual entry (EXP-05).
- **Generate rent.** Preview (nothing saved) + save of ticked rows in one DB transaction with one audit row; units that got rent since the preview are skipped (INC-04).
- **Attachments.** JPG/PNG/WebP/PDF, ≤ 5 per entry, ≤ 5 MB each, uploaded straight to a private **S3-compatible bucket** (Cloudflare R2 in prod, a local S3-compatible store in dev/test via `docker-compose`) through a presigned PUT URL; magic-byte check on link; view via 5-minute signed GET URL; add after save and soft-remove in Open months (ATT-01..03). Images compressed client-side (≤ 2000 px, ~80 %).
- **Money utilities.** Pure parse/format module: strip `৳`/commas/spaces, Bangla digits, ≤ 2 decimals → integer paisa; lakh grouping in both languages.
- **Permissions.** New keys `transaction.view`, `transaction.create`, `transaction.update`, `transaction.void`, `transaction.adjust`, `attachment.view`, `category.manage`, `unit.manage`, `fund.manage`. Owner gains `transaction.view` + `attachment.view` (read-only).
- **Audit.** `transaction.created|updated|voided|rent_generated|adjustment_created`, `attachment.added|removed`, `unit.*`, `fund_account.*`, `category.*`, each in the same DB transaction as the change (AUD-01).
- **UI.** `/[lang]/entries?period=&type=&category=` (month picker, lock banner, tabs, chips, list, footer total, empty/loading states, mobile FAB), entry drawer (create/correct), detail drawer, void dialog, Generate rent dialog, `/[lang]/settings` master-data screens. Nav gains "Income & expenses" and "Settings". Bangla + English, usable at 360 px (I18N-01).
- **Tests.** Unit (money, accounting totals, permissions), integration for every endpoint (PRD test cases IE-01…IE-20), UI component tests, and a Playwright E2E story for the admin + owner flows.

## Capabilities

### New Capabilities
- `periods`: monthly accounting periods (Open/Closed), on-demand opening of the current month, closed-period write guard, period list API.
- `money`: integer-paisa parsing and bilingual lakh-grouped formatting.
- `master-data`: units, fund accounts (with computed balances) and income/expense categories, including system-category rules and default seeding.
- `house-transactions`: income/expense create, list, summary, detail, correct, void, adjustments/arrear, Generate rent, vendors, warnings, idempotency, totals and audit.
- `attachments`: presigned upload to private S3-compatible storage, validation, link/remove, signed viewing.
- `entries-ui`: Income & Expenses screen, entry/detail drawers, void and Generate-rent dialogs, Settings master-data screens, navigation entries.

### Modified Capabilities
- `rbac`: the role→permission map grows from 14 to 23 keys; Owner goes from 4 to 6 keys (adds `transaction.view`, `attachment.view`).

## Impact

- **Database:** new tables `periods`, `units`, `fund_accounts`, `categories`, `house_transactions`, `attachments`, `idempotency_keys`; closed-period and no-delete triggers; partial indexes. One Prisma migration.
- **API (`/api/v1`):** `periods`, `units`, `fund-accounts`, `categories`, `transactions` (+ `summary`, `[id]`, `[id]/void`, `[id]/attachments`, `adjustments`, `generate-rent`, `generate-rent/preview`, `vendors`), `attachments/presign`, `attachments/[id]` — all registered in Swagger.
- **Code:** `lib/money.ts`, `lib/accounting/`, `lib/periods/`, `lib/master-data/`, `lib/transactions/`, `lib/storage/`, `lib/property.ts`, `lib/permissions.ts`, `lib/audit.ts`, `lib/api/errors.ts`, `lib/i18n/{en,bn}.ts`, `components/entries/*`, `components/settings/*`, `components/app/ShellNav.tsx`, `scripts/seed.ts`.
- **Dependencies:** `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`. `docker-compose.yml` gains a local S3 service; `scripts/storage-init.ts` creates the bucket; `.env.example` and `lib/env.ts` gain `S3_*` variables; Playwright web server gets S3 env.
- **Other modules:** Distribution, Home dashboard and Reports will read `periodTotals()` and fund balances from this module.

## Out of scope

- All P2 items: unpaid-rent tracking (INC-05), recurring templates (EXP-04), search/date filter (LST-06), CSV export (LST-07, `transaction.export`), objection link (DET-02, `complaint.create`), fund transfers (FND-02), notifications (§12.2).
- Month Close / Reopen, Reserve and Distributable calculation, Distribution Board, dashboard staircase.
- **RSV-01 Reserve-low warning** — needs the Reserve balance owned by Distribution; deferred to that change (flagged conflict with the PRD's P1 list).
- OWNER_GRANT creation (Requests › Disburse) and `beneficiary_owner_id` / `request_id` columns — owners and requests tables don't exist yet; they are added by those modules.
- Payment / Advance / Loan entry types in the drawer (Owner Ledger PRD).
- Cron-based period opening (no scheduler yet; on-demand opening covers PER-01).
