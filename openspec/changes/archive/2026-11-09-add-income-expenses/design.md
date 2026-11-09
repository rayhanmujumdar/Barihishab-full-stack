## Context

See proposal.md (Why). Current state the design builds on:

- **Stack:** Next.js 16.4 App Router with `cacheComponents: true` (pages read runtime data inside `<Suspense>`; `params`/`searchParams` are Promises), React 19, Prisma 7 (`lib/generated/prisma`, `@prisma/adapter-pg`), zod 4, Tailwind v4, shadcn/ui (zero radius, tokens), `@heroicons/react` only.
- **API plumbing already in place:** `withAuth(handler, { permission, strict, csrf })` (`lib/auth/guard.ts`), `readJson`/`parse`/`searchParams` (`lib/api/body.ts`), `ok()`/`fail()` envelope `{ success, data | error }`, `apiError(code)` catalogue with bn/en messages (`lib/api/errors.ts`), `isUuid`, `audit(tx, entry)` (`lib/audit.ts`, append-only table), OpenAPI registry per `schema.ts` imported by `app/api/v1/openapi.ts`, browser client `lib/api/client.ts` (CSRF + refresh).
- **Pages:** `app/[lang]/(app)/…`, `requireViewer()` / `requirePagePermission()` (`lib/auth/server.ts`), `<Forbidden>`, `localePath()`, flat i18n dictionaries `lib/i18n/{en,bn}.ts` (key parity is tested), `ShellNav` filters items by permission.
- **Tests:** vitest projects `unit` (lib), `integration` (real Postgres `_test` DB, route handlers called directly with `apiRequest()` + `loginAs()`, tables truncated per test), `ui` (jsdom); Playwright on `next start` against the `_test` DB, files run in order with one worker, `auth.spec.ts` onboards `ADMIN` first.
- **Missing:** no `periods`, `owners`, requests, file storage, or property helper (v1 has exactly one `properties` row created by the seed).

## Goals / Non-Goals

**Goals:**
- Follow the existing layering exactly: `route.ts` (thin: guard → parse → service → envelope) + `schema.ts` (zod + OpenAPI) + `lib/<module>/*-service.ts` (Prisma, one transaction, audit) + pure helpers with unit tests.
- Server Components fetch page data by calling services directly (no HTTP hop); client components mutate through `/api/v1` and then `router.refresh()`.
- Keep it small: no new state library, no generic repository layer, no SQL views.

**Non-Goals:**
- A storage abstraction beyond what tests need; multi-property UI; background jobs (cron, orphan-upload cleanup); Reserve/Distributable math.

## Decisions

### D1. Data model (one migration `income_expenses`)

Prisma models with `@@map` snake_case, `@db.Uuid`, `Timestamptz(6)`, `onDelete: Restrict` on every FK:

| Model / table | Key columns |
| --- | --- |
| `Period` / `periods` | `propertyId`, `month` `@db.Date` (1st of month), `status` enum `PeriodStatus { OPEN CLOSED }`, `closedAt?`, `closedBy?`; `@@unique([propertyId, month])` |
| `Unit` / `units` | `name`, `tenantName?`, `rentPaisa BigInt` (≥ 0 CHECK), `defaultFundAccountId?`, `sortOrder`, `isActive`; `@@unique([propertyId, name])` |
| `FundAccount` / `fund_accounts` | `name`, `type` enum `FundType { CASH BANK WALLET }`, `openingBalancePaisa BigInt`, `openingDate @db.Date`, `isActive` |
| `Category` / `categories` | `kind` enum `TxnKind { INCOME EXPENSE }`, `code`, `nameEn`, `nameBn`, `isSystem`, `isActive`, `sortOrder`; `@@unique([propertyId, code])` |
| `HouseTransaction` / `house_transactions` | `periodId`, `kind`, `categoryId`, `unitId?`, `amountPaisa BigInt`, `txnDate @db.Date`, `fundAccountId`, `vendor?`, `description?`, `fromReserve`, `referencePeriodId?`, `source` enum `TxnSource { MANUAL GENERATED_RENT ADJUSTMENT }`, `isCorrected`, `voidedAt?`, `voidedBy?`, `voidReason?`, `createdBy`, `updatedBy?` |
| `Attachment` / `attachments` | `entityType` (`'house_transaction'`), `entityId?`, `storageKey` (unique), `fileName`, `mime`, `sizeBytes`, `uploadedBy`, `linkedAt?`, `removedAt?`, `removedBy?` |
| `IdempotencyKey` / `idempotency_keys` | `propertyId`, `key`, `requestHash` (SHA-256 of method+path+body), `status`, `body Json`, `createdAt`; `@@id([propertyId, key])` |

Hand-written SQL appended to the migration: `CHECK (amount_paisa > 0 AND amount_paisa <= 1000000000)`, `CHECK (NOT from_reserve OR kind = 'EXPENSE')`, `CHECK ((voided_at IS NULL) = (void_reason IS NULL))`, attachment mime/size CHECKs, the PRD §9.3 `block_closed_period()` trigger on `house_transactions` (BEFORE INSERT OR UPDATE), a `no_delete()` BEFORE DELETE trigger on `house_transactions` and `attachments` plus `REVOKE DELETE … FROM PUBLIC` (same pattern as `audit_logs`), and the partial indexes of PRD §9.2 except the P2 trigram index. `tests/helpers/db.ts` adds the new tables to the TRUNCATE list (TRUNCATE doesn't fire row triggers).

*Deviations from PRD §9:* `beneficiary_owner_id` / `request_id` are omitted (their tables don't exist; Requests adds them). `source` drops `RECURRING`/`REQUEST` for now. `attachments.entity_id` is nullable until linked (presign creates the row). `house_transactions.idempotency_key` is replaced by the `idempotency_keys` table because replay must return the *original response*, and generate-rent creates many rows per key. Prisma `BigInt` maps money; JSON serialises it as a JS `number` (max values stay far below 2^53).

### D2. Property scope

`lib/property.ts#currentPropertyId()` returns the single property's id (React `cache` per request; module-level memo in route handlers is avoided so tests that recreate the property still work). Every service takes `propertyId` and filters by it; ids from other properties behave as `404`.

### D3. Periods service (`lib/periods/`)

- `monthKey(date)` / `parseMonth("YYYY-MM")` / `monthLabel(locale, "YYYY-MM")` pure helpers.
- `ensureCurrentPeriod(propertyId)` = `INSERT … ON CONFLICT (property_id, month) DO NOTHING` for `todayIsoInDhaka()`'s month (race-safe, never changes status). Called by `GET /periods`, the entries page loader and create/generate services.
- `lockOpenPeriod(tx, propertyId, month)` = `SELECT id, status FROM periods WHERE … FOR SHARE`; returns the row or a typed `PERIOD_CLOSED` / not-found result. Every write locks both old and new period. A Postgres `PERIOD_CLOSED` exception from the trigger (only reachable on a race the lock should prevent) is mapped to `409 PERIOD_CLOSED` as a backstop.

*Deviation:* PRD PER-01 cron is replaced by on-demand opening (no scheduler exists); observable behaviour is the same.

### D4. Pure accounting & money (`lib/money.ts`, `lib/accounting/totals.ts`)

- `parseAmount(input): number | null` and `formatMoney(locale, paisa)` per the money spec; lakh grouping done by hand (Intl `en-IN` grouping is close but its Bangla output and minus sign differ across runtimes).
- `toPeriodTotals(groups)` turns `groupBy(['kind','fromReserve'])` sums/counts into `{ incomePaisa, expensePaisa, reserveSpentPaisa, incomeCount, expenseCount }`; `fundBalance(opening, income, expense)`. Both files 100 % covered (added to `vitest.config.mts` thresholds).
- Fund balances: one `groupBy(['fundAccountId','kind'])` over non-voided rows, folded in memory — no stored balances.

### D5. Transaction service (`lib/transactions/`)

`transaction-service.ts` exposes `createTransaction`, `correctTransaction`, `voidTransaction`, `createAdjustment`, `previewRent`, `generateRent`, `listTransactions`, `periodSummary`, `getTransactionDetail`, `vendorSuggestions`. Each write:

1. Route: `withAuth({ permission, strict: true })` → `readJson(zod)` → `withIdempotency()` for POST creates.
2. Service: resolve references (category, unit, fund, periods) scoped by property → rule checks (`rules.ts`, pure: category/unit/reference/from-reserve rules → field errors) → `prisma.$transaction`: lock period(s), write, link attachments, `audit()` → compute warnings (`warnings.ts`) and `periodTotals` after commit.
3. Services return `{ ok: true, … } | { ok: false, code, fields? }`, the same discriminated-union style as `lib/users/admin-service.ts`; routes map to `apiError()` / `fieldError()`.

Correct writes `before/after` for **changed fields only** (diff computed in `rules.ts#diffFields`). Generate rent re-checks "has non-voided RENT for unit+period" inside the transaction after locking the period row, so rows paid since the preview land in `skipped`.

`ARREAR` requires `transaction.adjust` in addition to `transaction.create` — checked in the route with `can()`, since the guard takes one permission.

### D6. Idempotency (`lib/api/idempotency.ts`)

`withIdempotency(req, propertyId, body, run)`: requires header `Idempotency-Key`; looks up `(propertyId, key)`: same hash + stored → replay stored `{status, body}`; different hash → `409 IDEMPOTENCY_CONFLICT`. Otherwise inserts the key row **inside the same DB transaction** as the write (the service accepts an `onCommit(tx, response)` hook), so a concurrent duplicate blocks on the primary key and then replays. Rows older than 24 h are ignored on read (no cleanup job).

*Changed during apply:* server warnings (duplicate, second rent) come back only after the save, so the drawer closes and shows them as a warning toast; the live, pre-save warnings (fund going negative, date far from the month) render in the drawer's alert strip. *Alternative rejected:* a unique column on `house_transactions` can't replay the original response or cover multi-row generate-rent.

### D7. Attachments on S3-compatible storage (`lib/storage/`)

- Deps: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`. Env (validated in `lib/env.ts`, optional so auth-only setups still boot; attachment routes return `500` with a logged config error if missing): `S3_ENDPOINT`, `S3_REGION` (default `auto`), `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`, `S3_PUBLIC_ENDPOINT` (browser-reachable endpoint for presigned URLs when it differs from the server's).
- `lib/storage/index.ts` exports a tiny `Storage` interface `{ presignPut(key, mime, size), presignGet(key, fileName, mime), head(key), readHead(key, bytes) }` with the S3 implementation and `setStorageForTests(fake)`; integration tests use an in-memory fake, E2E uses the real local S3 store.
- Keys: `p/<propertyId>/att/<uuid>` — never from the file name. Presigned PUT signs `Content-Type` and `Content-Length`; GET signs `ResponseContentDisposition=inline; filename*=UTF-8''…` and 300 s expiry.
- `lib/files/magic.ts` (pure, unit-tested): magic-byte sniff for JPEG/PNG/WebP/PDF; linking reads the first 16 bytes with a ranged GET and `HEAD`s the size.
- Dev/test: `docker-compose.yml` adds an `s3` service running **RustFS** (S3-compatible, 127.0.0.1:9000). *Changed during apply:* the MinIO images are no longer pullable from Docker Hub or quay.io, so MinIO was replaced; `scripts/storage-init.ts` (`pnpm storage:init`, also run by `pnpm db:up` and the E2E global setup) creates the private bucket and its CORS rule (`PUT`/`GET` from `APP_URL` / the E2E origin). Prod: Cloudflare R2 bucket with CORS for the app origin.
- The app CSP (`next.config.ts`) adds the storage origin to `connect-src` (browser PUT) and `img-src` (signed thumbnails).
- Client: `components/entries/upload.ts` compresses images with `createImageBitmap` + `OffscreenCanvas`/`<canvas>` → `image/webp` 0.8 (≤ 2000 px), then presign → `fetch(PUT)` → keeps `attachmentId`.

*Alternative rejected:* proxying uploads through a route handler (simpler CORS, but 5 MB bodies through the app server and contrary to the user's choice of presigned S3/R2).

### D8. API surface

All under `app/api/v1/`, each folder `route.ts` + `schema.ts` registered in `openapi.ts`:
`periods`, `units`, `units/[id]`, `fund-accounts`, `fund-accounts/[id]`, `categories`, `categories/[id]`, `transactions`, `transactions/summary`, `transactions/vendors`, `transactions/adjustments`, `transactions/generate-rent`, `transactions/generate-rent/preview`, `transactions/[id]`, `transactions/[id]/void`, `transactions/[id]/attachments`, `transactions/[id]/attachments/[attId]`, `attachments/presign`, `attachments/[id]`. GETs call `await connection()` and send `Cache-Control: no-store`.

*Deviations from PRD §10:* JSON uses **camelCase** and the existing `{ success, data | error }` envelope (consistency with every current endpoint); the PRD's `/attachments/presign` permission and others are kept as written. New error codes in `ERRORS` (bn + en): `PERIOD_CLOSED` 409, `ALREADY_VOIDED` 409, `IDEMPOTENCY_CONFLICT` 409, `CATEGORY_LOCKED` 409, `FUND_NOT_EMPTY` 409, `NAME_TAKEN` 409, `FILE_TOO_LARGE` 413, `TOO_MANY_ATTACHMENTS` 422.

### D9. Validation & i18n

Shared zod field builders in `lib/validation/money-fields.ts` (period `YYYY-MM`, ISO date, amount int range, reason 5–500, ≤ 100/200 strings) used by route schemas and the client forms. Server field messages stay English codes-as-text like today; the client renders localized messages from `lib/i18n` keys (`entries.err.*`) keyed by field, so Bangla users never see English. All new UI strings go into both dictionaries (parity test already enforces it). Category names come from `nameEn`/`nameBn`. Month labels via `Intl.DateTimeFormat(bn-BD|en-GB, { month: 'long', year: 'numeric' })` + Bangla digits.

### D10. UI composition

- `app/[lang]/(app)/entries/page.tsx` — Server Component; `<Suspense fallback={<EntriesSkeleton/>}>` wraps an async child that awaits `searchParams`, checks `requirePagePermission('transaction.view')`, ensures the current period, and loads periods, summary, list, categories, units, fund accounts (with balances) in one `Promise.all`. Passes plain serialisable props to client components.
- Client components in `components/entries/`: `EntriesView` (header, month picker, tabs, chips via `<Link>` URL changes — no client state for filters), `EntryRow`, `EntryDrawer` (shadcn `Sheet`, create/correct), `DetailDrawer` (fetches `GET /transactions/:id` on open), `VoidDialog` (built on the existing `ConfirmDialog` with a reason field), `GenerateRentDialog` (shadcn `Dialog`), `AttachmentPicker`. After any mutation: toast + `router.refresh()`.
- `app/[lang]/(app)/settings/page.tsx` + `components/settings/{UnitsSection,FundsSection,CategoriesSection}.tsx`, same pattern; deactivate uses `ConfirmDialog`.
- `ShellNav` gains two items (`BanknotesIcon`, `Cog6ToothIcon`), filtered by permission; mobile FAB/⋯ menu inside `EntriesView` below 860 px.
- Styling strictly via the design-system tokens/classes already in `app/globals.css` (ink tabs/chips, 2 px rules, one yellow signal on the primary/FAB).

### D11. Seed

`lib/master-data/defaults.ts#ensureDefaultCategories(tx, propertyId)` (upsert by code) is called by `scripts/seed.ts` and by the test factory. `SEED_DEMO=true` additionally creates the PRD §2.2 units and fund accounts for local demos; E2E creates its own master data through the Settings UI.

### D12. Test strategy

- **Unit (`lib/**/*.test.ts`)**: `money` (IE-02 + format cases), `accounting/totals`, `files/magic`, `transactions/rules` (category/unit/reference/from-reserve/diff), `transactions/warnings`, `periods` month helpers, `permissions` (23/6 keys).
- **Integration (`tests/integration/api/*.test.ts`)**: one file per resource — `periods`, `master-data`, `transactions-create`, `transactions-correct-void`, `transactions-list`, `generate-rent`, `adjustments`, `attachments` (fake storage), `idempotency`, `db-guards` (direct SQL trigger + delete), plus `openapi.test.ts` asserting every new path is documented. Each PRD case IE-01…IE-20 maps to a named test. Factory helpers: `createPeriod(month, status)`, `createUnit`, `createFund`, `seedCategories`, `createTxn`.
- **UI (`components/**/*.test.tsx`)**: entry drawer validation + Bangla amount, void dialog reason gating, generate-rent total of ticked rows, tabs/chips rendering.
- **E2E (`e2e/income-expenses.spec.ts`, after `auth.spec.ts`)**: admin creates fund + units in Settings → Generate rent (untick one) → add expense with a PNG bill → detail shows bill + history → correct with reason → void with reason → closed month (set via `e2e/db.ts`) shows lock banner and no buttons → Owner (created via the users API + invite) sees read-only list; plus a 360 px Bangla screenshot in `visual.spec.ts`. `global-setup` creates the test bucket; Playwright `webServer.env` gets the `S3_*` vars.

## Risks / Trade-offs

- [The local S3 store (RustFS) becomes a hard dependency for E2E and attachment dev work] → `docker compose up` already required for Postgres; `storage:init` creates bucket + CORS automatically; integration tests use a fake.
- [Orphaned uploads (presigned but never linked)] → rows have `entityId = null`; harmless and private. A cleanup job is deferred (noted for ops).
- [Presigned URL host differs between server and browser in Docker/dev] → `S3_PUBLIC_ENDPOINT` used only for signing browser-facing URLs.
- [`router.refresh()` re-renders the whole page after each write] → page data is a few hundred rows max (PRD perf budget p95 < 300 ms); simpler than client caches.
- [On-demand period opening instead of cron] → a month with zero activity still opens on the first visit; no business rule depends on the exact opening time.
- [RSV-01 deferred] → From-Reserve still works and is tagged; only the low-reserve warning waits for Distribution.
- [BigInt ↔ number] → amounts capped at 1e9 paisa and balances far below 2^53; conversion centralised in DTO mappers.

## Migration Plan

1. `pnpm db:up` (now also starts the local S3 store and creates the bucket) → `pnpm db:migrate` applies `income_expenses` → `pnpm db:seed` adds default categories to the existing property (idempotent).
2. Add `S3_*` to `.env` (local S3 values in `.env.example`; R2 values in prod).
3. Rollback: the migration only adds tables/types/triggers; reverting the code and dropping the new tables restores the previous state (no existing table is altered).

## Open Questions

- PRD §16 items (reason for every edit vs amount only, whole-taka rent, big-expense approval, partial rent, attachment visibility window, rooftop lease cadence, bank-charge category) — this design follows the PRD as written; each can change later without reshaping the module.
