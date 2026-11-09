## 1. Setup & infrastructure

- [x] 1.1 Read `node_modules/next/dist/docs/` pages for route handlers (`route.md`, dynamic `params`), `page.md` (`searchParams` Promise), `connection()`, `refresh`/`useRouter`, and Cache Components + Suspense before writing code
- [x] 1.2 Add deps `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` (pnpm)
- [x] 1.3 Extend `docker-compose.yml` with an S3-compatible `s3` service (RustFS — MinIO images are no longer pullable) and `scripts/storage-init.ts` (create private bucket, CORS `PUT`/`GET` from `APP_URL`); add `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`, `SEED_DEMO` to `.env.example`
- [x] 1.4 Add optional `S3_*` vars to `lib/env.ts` schema plus a `storageEnv()` accessor that throws a clear config error when attachment code runs without them
- [x] 1.5 Add `lib/property.ts#currentPropertyId()` (single v1 property, per-request `cache`)

## 2. Permissions & errors (`rbac`)

- [x] 2.1 Write failing tests in `lib/permissions.test.ts`: Super Admin has 23 keys, Owner exactly 6 (adds `transaction.view`, `attachment.view`), Owner lacks every write key
- [x] 2.2 Add the 9 new keys to `ALL_PERMISSIONS` and Owner's list in `lib/permissions.ts`; make 2.1 pass
- [x] 2.3 Write failing tests in `lib/api/errors.test.ts` for `PERIOD_CLOSED`, `ALREADY_VOIDED`, `IDEMPOTENCY_CONFLICT`, `CATEGORY_LOCKED`, `FUND_NOT_EMPTY`, `NAME_TAKEN` (409), `FILE_TOO_LARGE` (413), `TOO_MANY_ATTACHMENTS` (422) with bn + en messages (PRD §8 wording)
- [x] 2.4 Add the codes to `ERRORS`; add the new audit actions to `AUDIT_ACTIONS` in `lib/audit.ts`

## 3. Pure modules (money, accounting, files)

- [x] 3.1 Write failing tests `lib/money.test.ts`: IE-02 `"৳১৮,০০০.৫০"` → 1800050, `"6,300"` → 630000, `"0.5"` → 50, rejects `0`, `-5`, `12.345`, `abc`, > 1 crore; `formatMoney` en/bn lakh grouping, paisa only when non-zero, negative `−৳2,300`
- [x] 3.2 Implement `lib/money.ts` (`parseAmount`, `formatMoney`, `MAX_AMOUNT_PAISA`) to 100 % coverage
- [x] 3.3 Write failing tests `lib/accounting/totals.test.ts`: `toPeriodTotals` (income, expense excl. reserve, reserveSpent, counts, empty), `fundBalance`, PRD §11 October example (10300000 / 1398000)
- [x] 3.4 Implement `lib/accounting/totals.ts`; add 100 % thresholds for `lib/money.ts` and `lib/accounting/**` in `vitest.config.mts`
- [x] 3.5 Write failing tests `lib/files/magic.test.ts` (JPEG, PNG, WebP, PDF accepted; `MZ` as jpeg rejected; short buffer rejected) and implement `lib/files/magic.ts`
- [x] 3.6 Write failing tests `lib/periods/month.test.ts` (`parseMonth`, `monthKey` in Asia/Dhaka at month boundaries, `monthLabel` bn/en, `daysFromPeriod`) and implement `lib/periods/month.ts`

## 4. Data model & migration

- [x] 4.1 Write failing integration tests `tests/integration/db/income-expenses-schema.test.ts`: unique `(property_id, month)` periods, `amount_paisa` 0 rejected, `from_reserve` on INCOME rejected, void reason/at pairing CHECK, direct UPDATE in a CLOSED period raises `PERIOD_CLOSED`, moving a row out of a CLOSED period raises, DELETE on `house_transactions` and `attachments` raises, unique `(property_id, code)` categories
- [x] 4.2 Add Prisma models/enums `Period`, `Unit`, `FundAccount`, `Category`, `HouseTransaction`, `Attachment`, `IdempotencyKey` (`PeriodStatus`, `FundType`, `TxnKind`, `TxnSource`) per design D1, all FKs `onDelete: Restrict`
- [x] 4.3 Create migration `income_expenses` with `prisma migrate dev --create-only`; append hand-written SQL: CHECKs, `block_closed_period()` trigger, `no_delete()` trigger + `REVOKE DELETE … FROM PUBLIC`, partial indexes (PRD §9.2 minus trigram)
- [x] 4.4 Apply migration + `prisma generate`; add new tables to `tests/helpers/db.ts` TRUNCATE list; extend `tests/helpers/factory.ts` with `createPeriod`, `createFund`, `createUnit`, `seedCategories`, `createTxn`; make 4.1 pass

## 5. Periods (`periods`)

- [x] 5.1 Write failing integration tests `tests/integration/api/periods.test.ts`: GET creates current Dhaka month OPEN (frozen clock), keeps an existing CLOSED month, concurrent calls create one row, ordering newest first + `latestOpen`, Owner 200, anonymous 401
- [x] 5.2 Implement `lib/periods/period-service.ts` (`ensureCurrentPeriod` via `INSERT … ON CONFLICT DO NOTHING`, `listPeriods`, `lockOpenPeriod(tx, …)` with `FOR SHARE`, `PERIOD_CLOSED` DB-error mapper)
- [x] 5.3 Implement `app/api/v1/periods/{route,schema}.ts`; make 5.1 pass

## 6. Master data (`master-data`)

- [x] 6.1 Write failing integration tests `tests/integration/api/master-data.test.ts`: units create/patch/duplicate `NAME_TAKEN`/inactive default fund rejected/`?active=true` filter; fund accounts balance (opening + income − expense, voided ignored, From-Reserve counted), deactivate non-zero → `FUND_NOT_EMPTY`, zero → 200; categories list by kind, create (generated code), rename admin category, system rename/deactivate → `CATEGORY_LOCKED` (IE-16); audit rows with changed-field before/after; Owner 403 on every write, 200 on reads
- [x] 6.2 Write failing test `tests/integration/scripts/seed.test.ts` additions: default categories created once across two seed runs; `SEED_DEMO=true` creates the PRD §2.2 units and two fund accounts
- [x] 6.3 Implement `lib/master-data/defaults.ts` (`ensureDefaultCategories`), `unit-service.ts`, `fund-service.ts` (balances via one `groupBy`), `category-service.ts`, `dto.ts` (BigInt → number)
- [x] 6.4 Implement routes + schemas: `units`, `units/[id]`, `fund-accounts`, `fund-accounts/[id]`, `categories`, `categories/[id]`
- [x] 6.5 Call `ensureDefaultCategories` (and demo data when `SEED_DEMO=true`) from `scripts/seed.ts`; make 6.1 and 6.2 pass

## 7. Idempotency

- [x] 7.1 Write failing integration tests `tests/integration/api/idempotency.test.ts`: missing header → 422, same key + body → identical replay and one row (IE-14), same key + different body → `409 IDEMPOTENCY_CONFLICT`, two concurrent requests → one row, key older than 24 h treated as new
- [x] 7.2 Implement `lib/api/idempotency.ts` (`withIdempotency`, request hash, key row written in the same DB transaction as the data)

## 8. Transactions: create, list, summary, detail (`house-transactions`)

- [x] 8.1 Write failing unit tests `lib/transactions/rules.test.ts` (category kind match, OWNER_GRANT/ADJUSTMENT_* refused for manual, unit required for RENT/ARREAR and refused on EXPENSE, reference month CLOSED and earlier, from-reserve only on EXPENSE, future-date limit, `diffFields`) and `warnings.test.ts` (`RENT_ALREADY_RECORDED`, `POSSIBLE_DUPLICATE`, `FUND_NEGATIVE`, `DATE_FAR_FROM_PERIOD` 45-day edges)
- [x] 8.2 Implement `lib/transactions/rules.ts` and `warnings.ts` (pure)
- [x] 8.3 Write failing integration tests `tests/integration/api/transactions-create.test.ts`: IE-01 (201, totals, auto description), IE-03, IE-04, IE-11, IE-12, IE-13 (ARREAR needs `transaction.adjust` + CLOSED earlier reference), IE-15, IE-17, OWNER_GRANT refused, inactive category/fund/unit refused, `txnDate` > tomorrow refused, audit `transaction.created` in the same transaction
- [x] 8.4 Implement `lib/transactions/transaction-service.ts#createTransaction` and `dto.ts`; implement `app/api/v1/transactions/{route,schema}.ts` POST; make 8.3 pass
- [x] 8.5 Write failing integration tests `tests/integration/api/transactions-list.test.ts`: list ordering, kind/category filters, voided rows present but excluded from `totalPaisa`, attachment counts, cursor pagination, summary tab counts/totals and chips only for used categories, unknown period → empty with `status: null`, detail with history (created + update + void, oldest first, actor names), 404 for another property's id
- [x] 8.6 Implement `listTransactions`, `periodSummary`, `getTransactionDetail`; routes `transactions` GET, `transactions/summary`, `transactions/[id]` GET; make 8.5 pass
- [x] 8.7 Write failing integration test for `GET /transactions/vendors` (prefix, case-insensitive, distinct, most used first, max 10, Owner 403) and implement it

## 9. Transactions: correct, void, adjustments

- [x] 9.1 Write failing integration tests `tests/integration/api/transactions-correct-void.test.ts`: IE-05 (changed fields only in audit, `isCorrected`), IE-06, IE-07, IE-08, IE-18, IE-19, no-op patch → 422, kind change refused, void twice → `ALREADY_VOIDED`, void in CLOSED → `PERIOD_CLOSED`, void reason < 5 → 422, Owner 403, audit failure rolls back the void
- [x] 9.2 Implement `correctTransaction` and `voidTransaction` (lock old + new periods); routes `transactions/[id]` PATCH and `transactions/[id]/void`; make 9.1 pass
- [x] 9.3 Write failing integration tests `tests/integration/api/adjustments.test.ts`: income and expense adjustments get `ADJUSTMENT_INC/EXP` + `source=ADJUSTMENT`, reference must be CLOSED and earlier, reason required, `transaction.adjustment_created` audit, Owner 403, idempotent
- [x] 9.4 Implement `createAdjustment` and `transactions/adjustments` route; make 9.3 pass

## 10. Generate rent

- [x] 10.1 Write failing integration tests `tests/integration/api/generate-rent.test.ts`: IE-09 preview (6 units, one paid → 5 rows, unit default fund, inactive units excluded), save 5 rows → 5 entries + exactly 1 `transaction.rent_generated` audit row, second preview empty, IE-10 race → `skipped`, CLOSED period → 409, duplicate unit ids → 422, idempotent replay, Owner 403
- [x] 10.2 Implement `previewRent` / `generateRent` and routes `transactions/generate-rent/preview`, `transactions/generate-rent`; make 10.1 pass

## 11. Attachments (`attachments`)

- [x] 11.1 Implement `lib/storage/index.ts` (`Storage` interface, S3 implementation with presigned PUT/GET, `head`, ranged `readHead`, `setStorageForTests`) and `tests/helpers/fake-storage.ts`
- [x] 11.2 Write failing integration tests `tests/integration/api/attachments.test.ts`: presign 201 / bad mime 422 / 6 MB → 413 / Owner 403; link via create body and via `POST /transactions/:id/attachments`; IE-20 magic-byte mismatch → 422 and nothing linked; missing object → 422; size mismatch → 422; 6th file → `TOO_MANY_ATTACHMENTS`; another property's or already-linked attachment refused; remove → 204 + `attachment.removed` + gone from detail; remove/link in CLOSED → 409 and on voided → 409; view returns signed URL for Owner, 404 for removed/unlinked
- [x] 11.3 Implement `lib/attachments/attachment-service.ts` and routes `attachments/presign`, `attachments/[id]`, `transactions/[id]/attachments`, `transactions/[id]/attachments/[attId]`; wire linking into `createTransaction`; make 11.2 pass

## 12. Swagger

- [x] 12.1 Extend `tests/integration/api/openapi.test.ts` to assert every new path + method (periods, units, fund-accounts, categories, transactions/*, attachments/*) is present in `/api/v1/openapi.json`, including the `Idempotency-Key` header on the three create endpoints
- [x] 12.2 Import every new `schema.ts` in `app/api/v1/openapi.ts`; make 12.1 pass; open `/api/v1/docs` on the dev server and confirm the new tags render

## 13. i18n & shell

- [x] 13.1 Add all new UI strings (entries, drawer, detail, void, generate rent, settings, field errors, warnings, toasts, month picker, lock banner) to `lib/i18n/en.ts` and `lib/i18n/bn.ts`; keep the parity test green
- [x] 13.2 Write failing UI test in `components/app/shell.test.tsx`: Owner sees "Income & expenses" but not "Settings"; Super Admin sees both
- [x] 13.3 Add the two nav items to `ShellNav` (desktop + mobile) with heroicons; make 13.2 pass

## 14. Entries UI (`entries-ui`)

- [x] 14.1 Read `.agents/skills/barihisab-design-system/SKILL.md` and existing shadcn components (`sheet`, `dialog`, `alert-dialog`, `field`, `calendar`, `badge`); reuse `components/forms/*` and `ConfirmDialog`
- [x] 14.2 Write failing UI tests `components/entries/entries.test.tsx`: tabs show counts/totals and `aria-pressed`, chips only for used categories, voided row struck through with tag, footer label per filter, Owner sees no action buttons, Closed month shows lock banner and no buttons, empty states per tab
- [x] 14.3 Implement `app/[lang]/(app)/entries/page.tsx` (Suspense + async loader awaiting `searchParams`, `requirePagePermission('transaction.view')`, `ensureCurrentPeriod`, one `Promise.all`), `loading` skeleton (6 rows), `EntriesView`, `MonthPicker`, `EntryRow`; filters via `<Link>` URL state; mobile FAB + ⋯ menu under 860 px; make 14.2 pass
- [x] 14.4 Write failing UI tests `components/entries/entry-drawer.test.tsx`: Bangla amount input parsed, required fields show localized errors with `aria-describedby`, Rent requires unit, Arrear shows reference month, expense shows vendor + From Reserve, live `FUND_NEGATIVE` and date-far warnings, correct mode hides type segment and requires reason, one Idempotency-Key reused across retries
- [x] 14.5 Implement `EntryDrawer` (create + correct, vendor autocomplete, server warnings in the alert strip, success toast, `router.refresh()`, input kept on failure) and `AttachmentPicker` + `upload.ts` (compression ≤ 2000 px ~0.8, presign → PUT, thumbnails, remove, 5-file / 5 MB limits); make 14.4 pass
- [x] 14.6 Write failing UI tests for `DetailDrawer` (tags, hidden empty rows, history before → after, Correct/Void only for admin in Open month on non-voided) and `VoidDialog` (Void entry disabled until reason ≥ 5 chars)
- [x] 14.7 Implement `DetailDrawer` (fetch detail, signed-URL thumbnails, PDF in new tab, add attachment after save) and `VoidDialog`; make 14.6 pass
- [x] 14.8 Write failing UI tests for `GenerateRentDialog` (total of ticked rows updates, empty state "Every active unit already has rent recorded this month.", toast lists skipped units) and implement it

## 15. Settings UI

- [x] 15.1 Write failing UI tests `components/settings/settings.test.tsx`: sections shown per manage permission, System tag and locked controls on system categories, deactivate asks for confirmation, `FUND_NOT_EMPTY` error shown
- [x] 15.2 Implement `app/[lang]/(app)/settings/page.tsx` and `UnitsSection`, `FundsSection`, `CategoriesSection` (shadcn Sheet forms, `ConfirmDialog` for deactivate, `router.refresh()`); make 15.1 pass

## 16. End-to-end (Playwright)

- [x] 16.1 Make E2E storage-ready: `global-setup` ensures the private test bucket + CORS on the local S3 store; add `S3_*` to `playwright.config.ts` `webServer.env`; add `e2e/db.ts` helpers `setPeriodStatus(month, status)` and `createOwner()`
- [x] 16.2 Write `e2e/income-expenses.spec.ts` (serial, runs after `auth.spec.ts`): admin adds Cash + Bank funds and 3 units in Settings → Generate rent unticking Flat 3A (2 rows) → reopening shows only Flat 3A → + Expense 6,300 Electricity from DESCO with a PNG bill → toast + tab total → detail shows bill thumbnail and opens signed URL → correct amount with reason (Corrected tag + history) → void another entry with reason (struck through, excluded from total) → double-click Save creates one entry → previous month set CLOSED shows lock banner and no buttons → Owner sees list read-only and gets 403 on `POST /api/v1/transactions`
- [x] 16.3 Add `/bn/entries` desktop and 360 px screenshots to `e2e/visual.spec.ts` (Bangla digits, FAB visible on mobile)
- [x] 16.4 Run `pnpm test:e2e` until green; save screenshots under `.context/screens/`

## 17. Verification

- [x] 17.1 Run `pnpm typecheck`, `pnpm lint`, `pnpm test` (unit + integration + ui) and `pnpm test:coverage` (100 % on money/accounting, thresholds unchanged elsewhere)
- [x] 17.2 Run `pnpm build` (Cache Components prerender passes for `/[lang]/entries` and `/[lang]/settings`)
- [x] 17.3 Manual check on the dev server at 360 px and desktop in both languages: record a month (6 rents + 5 bills) and confirm totals match PRD §11
- [x] 17.4 Run `openspec validate add-income-expenses --strict`
