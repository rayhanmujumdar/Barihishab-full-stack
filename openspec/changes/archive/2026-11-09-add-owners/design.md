## Context

See proposal.md (Why). The Owners section lands on top of the shipped auth and income & expenses modules, and reuses their plumbing unchanged:

- **API layering:** `route.ts` (thin: `withAuth(handler, { permission })` → `readJson`/`parse` → service → `ok()`/`failResponse()`), `schema.ts` (zod 4 + `registry.registerPath`, imported in `app/api/v1/openapi.ts`), services in `lib/<module>/` returning `Result<T>` (`lib/api/result.ts`), `withIdempotency()` for money POSTs, `audit(tx, …)` inside the same `prisma.$transaction`.
- **Periods:** `periods` rows (OPEN/CLOSED), `ensureCurrentPeriod()`, `lockPeriod(tx, id)` (`FOR SHARE`), DB functions `block_closed_period()` and `financial_no_delete()` from the `income_expenses` migration.
- **Fund balances:** `lib/master-data/fund-service.ts#fundMovements` (one `groupBy` over `house_transactions`) + pure `fundBalance()` in `lib/accounting/totals.ts`; `balanceOf()` drives `FUND_NEGATIVE` warnings.
- **Attachments:** presign → link (`prepareAttachments` / `linkAttachments`) hard-coded to `entityType: "house_transaction"`.
- **Pages:** `app/[lang]/(app)/…` Server Components inside `<Suspense>` (`cacheComponents: true`), `requirePagePermission()`, services called directly (no HTTP hop); client components mutate via `lib/api/client.ts` then `router.refresh()`. i18n flat dictionaries `lib/i18n/{en,bn}.ts` with key-parity tests.
- **Users** already carry `houseResponsibility`, `phone`, `status` (INVITED = invite pending) and roles.
- **Not built:** Distribution (month close, entitlements) and Loans. Decided with the user: ledger-only (no month close), minimal `loans` table, print-view PDF.

## Goals / Non-Goals

**Goals:**
- One owner ledger table that Distribution and Loans can post into later without schema changes.
- All money math (balance, labels, oldest due, payout split, share %, statement running balance, advance limit, paid-out) in one pure module `lib/accounting/owners.ts` at 100 % coverage; services only fetch rows and call it.
- Same structure, naming and test style as the income & expenses module.

**Non-Goals:**
- SQL views or stored balances; generic ledger/repository abstractions; client data-fetching libraries.
- Server-side PDF generation; email/notifications (P2).
- Advance-limit settings UI, owner phone hiding (P2).

## Decisions

### D1. Data model (one migration `owners`)

| Model / table | Key columns |
| --- | --- |
| `Owner` / `owners` | `propertyId`, `userId?` (`@db.Uuid`), `displayName`, `initials`, `sortOrder Int`, `note?`, timestamps; `@@unique([propertyId, userId])` (NULLs distinct → many name-only owners allowed) |
| `ShareSet` / `share_sets` | `propertyId`, `effectiveFrom @db.Date`, `reason`, `createdById`, `createdAt`, `replacedAt?`; partial unique index `(property_id, effective_from) WHERE replaced_at IS NULL` |
| `ShareSetItem` / `share_set_items` | `shareSetId`, `ownerId`, `units Int` (CHECK ≥ 0); `@@id([shareSetId, ownerId])` |
| `OwnerLedgerEntry` / `owner_ledger_entries` | `propertyId`, `ownerId`, `periodId`, `type` enum `LedgerType`, `amountPaisa BigInt` (signed), `entryDate @db.Date`, `fundAccountId?`, `method` enum `PayMethod?`, `referenceNo?`, `note?`, `referencePeriodId?`, `reversesId?` (unique), `isSelf`, `flagged`, `createdById`, `createdAt`, `voidedAt?`, `voidedById?`, `voidReason?`; index `(owner_id, period_id)` |
| `Loan` / `loans` | `propertyId`, `ownerId`, `principalPaisa BigInt`, `disbursedOn @db.Date`, `fundAccountId`, `method`, `referenceNo?`, `reason`, `status` enum `LoanStatus { ACTIVE REPAID WRITTEN_OFF }`, `payoutEntryId?`, `createdById`, `createdAt` |

Hand-written SQL appended to the migration:
- CHECKs: `amount_paisa <> 0 AND abs(amount_paisa) <= 1000000000`; `type IN ('PAYOUT','ADVANCE') → amount_paisa < 0 AND fund_account_id IS NOT NULL`; `type = 'ENTITLEMENT' → amount_paisa > 0`; `type = 'REVERSAL' → reverses_id IS NOT NULL`; void triple all-null or all-set; `loans.principal_paisa > 0`.
- Partial unique index: one `OPENING` per owner (`(owner_id) WHERE type = 'OPENING'`).
- Triggers: `block_closed_period_ledger()` (D2) BEFORE INSERT OR UPDATE on `owner_ledger_entries`; existing `financial_no_delete()` BEFORE DELETE on `owners`, `share_sets`, `share_set_items`, `owner_ledger_entries`, `loans`; `REVOKE DELETE … FROM PUBLIC`.
- `tests/helpers/db.ts` adds the five tables to the TRUNCATE list.

*Why share sets + items over PRD §9.2 `ownership_shares(owner_id, units, effective_from)`:* the PRD treats a change as "all owners' units together" with one reason, and Rule 6 replaces a whole same-month set while keeping it in history. A per-owner row table can't express "replaced set" or a set-level reason without duplication. *Deviation noted.* Units ≥ 0 (not > 0 as in §9.2) so a set can explicitly move someone to 0 (former owner).

*Why `periodId` on every entry (including OPENING):* statement ranges, the closed-period trigger and Distribution all key on posting month. OPENING is posted in the earliest period (always exists: `ensureCurrentPeriod`). *Deviation:* PRD §9.3 has no `reverses_id`/`is_self`/`flagged` columns on the ledger; §9 common rules require `reverses_id`, and Self/Flagged are Owners PRD F12 display facts that must survive later rule changes, so they are stored.

### D2. Balance and void semantics

Balance = Σ all entries (originals + reversals), matching Rule 8 — no `WHERE voided_at IS NULL` anywhere for balances. Void sets the original's void fields **and** inserts a REVERSAL; the original's void-field UPDATE happens in the original's period, so voiding an entry whose period is now CLOSED would be refused by the trigger. Decision: the void UPDATE only touches void columns, and the trigger is changed for this table to allow an UPDATE that only sets void columns (`block_closed_period_ledger()`: skip the check when `OLD.amount_paisa = NEW.amount_paisa AND OLD.period_id = NEW.period_id AND OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL`). The money effect lands in the open month via the REVERSAL; the original is only marked. Alternative (don't mark the original, derive "voided" from an existing reversal) was rejected: listing and "can't void twice" become joins and the DB can't enforce once-only as simply as `reverses_id UNIQUE`.

Paid out {year} = Σ |amount| of PAYOUT/ADVANCE with `voidedAt IS NULL` dated in the year — equivalent to "minus reversals" (G5) without cross-year artefacts.

### D3. Concurrency

Payouts, advances, adjustments and voids run in one `prisma.$transaction`: `SELECT … FROM owners WHERE id = $1 FOR UPDATE` (serialises money moves per owner so the EXCEEDS_BALANCE check can't race), then `lockPeriod()` on the latest open period (`FOR SHARE`, blocks a concurrent close), then compute → insert → audit → idempotency save. Void additionally re-reads the entry `FOR UPDATE`; `reverses_id UNIQUE` is the backstop. Share sets lock the property's active same-month set row by `pg_advisory_xact_lock(hashtext(property_id || effective_from))` so two saves for one month leave one active set.

### D4. Pure accounting module `lib/accounting/owners.ts`

Functions (all paisa `number`, no I/O): `balanceLabel(b)`, `sharePercent(units, total)`, `setInForce(sets, month)`, `ownerStatus(sets, ownerId, month)` (+ `leftMonth`), `shareHistory(sets, ownerId)`, `oldestDueMonth(entries)`, `splitPayout(amount, balance)` → `{ payout, excess }`, `statement(entries, from, to)` → `{ broughtForward, rows with running, closing, totals }`, `advanceLimit(monthlyEntitlements)`, `paidOut(entries, year)`, `entitlementTotal(entries, year)`. Added to the 100 % coverage threshold with `lib/money.ts` and `lib/accounting/**` (already configured for the folder).

### D5. Services and routes

`lib/owners/`: `owner-service.ts` (list, detail, create, update, opening), `share-service.ts` (timeline, save), `ledger-service.ts` (payout, advance, void, adjustment, statement, balances), `loan-service.ts` (create in tx, outstanding by owner), `dto.ts`. Balances for the list come from one `groupBy({ by: ['ownerId'], _sum: amountPaisa })` and loans from one `groupBy` — no N+1.

Routes (each with `schema.ts`, all registered in Swagger):

| Route | Methods | Permission |
| --- | --- | --- |
| `owners` | GET, POST | `owner.view` / `owner.manage` |
| `owners/[id]` | GET, PATCH | `owner.view` / `owner.manage` |
| `owners/[id]/opening` | PUT | `owner.manage` |
| `owners/[id]/statement` | GET | `owner.view` |
| `owners/shares` | GET, POST | `owner.view` / `share.manage` |
| `payouts` | POST | `payout.create` |
| `advances` | POST | `advance.create` |
| `adjustments` | POST | `ledger.adjust` |
| `ledger/[id]/void` | POST | `ledger.void` |

`owners/shares` is a static segment next to `owners/[id]`; Next resolves static before dynamic, and `[id]` handlers already 404 non-UUIDs. PRD §10.2 paths are used verbatim (`/payouts`, `/advances`, `/adjustments`, `/ledger/:id/void`). Note `/adjustments` (owner) is distinct from the existing `/transactions/adjustments` (house).

New error codes in `lib/api/errors.ts` (bn + en): `USER_ALREADY_OWNER` 409, `NO_OPEN_PERIOD` 409, `EXCEEDS_BALANCE` 409 (details carry the split), `NOT_VOIDABLE` 409, `OPENING_LOCKED` 409. New audit actions: `owner.created`, `owner.updated`, `share_set.saved`, `ledger.opening_set`, `ledger.payout_created`, `ledger.advance_created`, `ledger.voided`, `ledger.adjustment_created`, `loan.created`.

### D6. Fund balance integration

`fundMovements()` gains two more `groupBy`s (ledger Σ amount by `fundAccountId`; ACTIVE loan Σ principal by `fundAccountId`) and `fundBalance(opening, income, expense, ledger = 0, loans = 0)` becomes `opening + income − expense + ledger − loans`. Existing callers keep working (defaults), and `FUND_NEGATIVE` warnings on income/expenses automatically see payouts. House Fund = Σ balances of active accounts.

### D7. Attachments

`linkAttachments(tx, propertyId, entityId, rows, actor, entityType = "house_transaction")` gets an `entityType` parameter; ledger entries link with `"owner_ledger_entry"`. Presign permission check widens to any of `transaction.create | payout.create | advance.create` (route uses `withAuth` without a single permission, then `can()` checks). Statement rows load attachments with one `findMany({ entityType: 'owner_ledger_entry', entityId: { in } })`.

### D8. Pages and components

- `app/[lang]/(app)/owners/page.tsx` — Server Component; `requirePagePermission('owner.view')`; calls `listOwners`, `listShareSets`, `listPeriods`, `listFunds` (admin only), `listUsers` not-yet-owners (admin only) in `Promise.all`.
- `app/[lang]/(app)/owners/[id]/page.tsx` — `searchParams` `{ year, from, to }` (Promise); `getOwnerDetail` + `statement` in parallel; `notFound()` for unknown ids.
- `app/[lang]/(app)/owners/[id]/statement/print/page.tsx` — same data, print CSS (`@media print`, `@page { margin-bottom … @bottom-center { content: … counter(page) " / " counter(pages) } }`), a tiny client component calls `window.print()` after mount; `generateMetadata` sets the title to the PRD file name. Rendered inside the `[lang]` layout but outside `(app)` chrome via its own route group `(print)` → path `app/[lang]/(print)/owners/[id]/statement/print/page.tsx`.
- `components/owners/`: `OwnersView` (cards, former, timeline sheet), `OwnerCard`, `ChangeSharesDialog`, `OwnerFormDialog` (add/edit), `OpeningDialog`, `OwnerDetail` (summary strip, year switcher), `StatementTable` (+ row detail sheet), `PayDrawer` (pay + advance modes, excess dialog), `VoidLedgerDialog`, `AdjustmentDialog`, `format.ts` (label → class/word). Reuse `EntryDrawer` building blocks where they are already standalone (`AttachmentPicker`, amount parsing `parseAmount`, `DateField`, `ConfirmDialog`, fund select); no refactor of `EntryDrawer` itself.
- URL is the state for year/from/to (`router.replace` with search params) so Server Components stay the data source; mutations → `router.refresh()`.
- `ShellNav` adds `{ href: "/owners", icon: UserGroupIcon, permission: "owner.view" }` after Entries; `HomeDesk` gets `ownerId` prop for the "Statement →" link.

### D9. Testing

- Unit: `lib/accounting/owners.test.ts` (100 %), `lib/permissions.test.ts` (30/7 keys), `lib/api/errors.test.ts` (new codes).
- Integration (`tests/integration/api/`): `owners.test.ts`, `owner-shares.test.ts`, `owner-ledger.test.ts` (opening, payout split/advance/loan, void, adjustment, idempotency, concurrency), `owner-statement.test.ts`, `fund-balance-ledger.test.ts`, `tests/integration/db/owners-schema.test.ts` (CHECKs, triggers), `openapi.test.ts` extended.
- UI (jsdom): `components/owners/owners.test.tsx` (cards/tags/labels, role-gated controls, change-shares validation + confirm, pay excess dialog, void dialog).
- E2E `e2e/owners.spec.ts` (serial, after `income-expenses.spec.ts`): admin adds owners + shares, sets opening, pays full, pays over → split advance, voids, adjusts, owner sees list/detail/statement without admin controls and is refused by API, print view title, bn + 360px check.

## Risks / Trade-offs

- [Mobile bottom nav gains a 7th cell for Super Admin (Home, Entries, Owners, Users, Settings, Profile, Logout)] → cells already truncate labels; verify at 360px in E2E/visual; if cramped, move Profile into the sidebar avatar later (out of scope).
- [Print-to-PDF depends on the browser; page "X of Y" margin boxes only in Chromium ≥ 131] → content is complete without the footer; spec scopes the footer to supporting browsers.
- [Entitlement figures are ৳0 until Distribution ships] → explicit in proposal; ledger types and `entitlementTotal()` are ready and unit-tested with synthetic ENTITLEMENT rows.
- [Void UPDATE in a closed period needs a trigger exception] → exception is narrow (only the void columns transition null → set); DB test covers both the allowed void and a refused amount change.
- [Loans are disbursement-only; a mistaken loan can't be reversed in this change] → Loans section owns reversal; documented as out of scope. The excess dialog makes the choice explicit before saving.
- [Owner linked to a deactivated user] → still an owner (financial history stays); tag logic only reads INVITED; balance/visibility unaffected.

## Migration Plan

1. `prisma migrate dev --create-only --name owners`, append SQL from D1/D2, `migrate dev`, `prisma generate`.
2. Seed: when `SEED_DEMO=true`, create the PRD §2.2 owners (link the seeded admin as Rayhan), 2026-01 and 2026-06 share sets and openings. Production seed creates no owners (setup empty state guides the admin).
3. Rollback: the migration only adds tables/enums/functions; dropping them restores the previous state. `fundBalance` defaults keep old behaviour if the ledger is empty.

## Open Questions

- PRD §13 questions (phone visibility default, share-change approvals, estate entitlements, paid-out including advances, per-owner advance limit, former-owner reminders, whole-taka payments) do not change this design; current behaviour follows the PRD text (advances included in Paid out, one advance-limit rule for everyone, paisa allowed).
