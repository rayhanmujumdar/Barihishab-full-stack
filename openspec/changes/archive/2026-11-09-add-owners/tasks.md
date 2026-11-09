## 1. Setup

- [x] 1.1 Read `node_modules/next/dist/docs/` for route handlers (dynamic `params` Promise, static vs dynamic segment precedence), `page.md` (`searchParams` Promise), `generateMetadata`, `notFound()`, route groups, `connection()` and Cache Components + Suspense before writing code
- [x] 1.2 Read `.agents/skills/barihisab-design-system/SKILL.md` and `.agents/skills/tdd`; skim `components/entries/{EntryDrawer,DetailDrawer,AttachmentPicker}.tsx`, `components/app/confirm-dialog.tsx`, `components/forms/*` for reusable pieces

## 2. Permissions, errors, audit actions (`rbac`)

- [x] 2.1 Write failing tests in `lib/permissions.test.ts`: Super Admin has 30 keys, Owner exactly 7 (adds `owner.view`), Owner lacks `owner.manage`, `share.manage`, `payout.create`, `advance.create`, `ledger.void`, `ledger.adjust`
- [x] 2.2 Add the 7 keys to `ALL_PERMISSIONS` and `owner.view` to Owner in `lib/permissions.ts`; make 2.1 pass
- [x] 2.3 Write failing tests in `lib/api/errors.test.ts` for `USER_ALREADY_OWNER`, `NO_OPEN_PERIOD`, `EXCEEDS_BALANCE`, `NOT_VOIDABLE`, `OPENING_LOCKED` (all 409, bn + en, Owners PRD §8 wording)
- [x] 2.4 Add the codes to `ERRORS`; add audit actions `owner.created`, `owner.updated`, `share_set.saved`, `ledger.opening_set`, `ledger.payout_created`, `ledger.advance_created`, `ledger.voided`, `ledger.adjustment_created`, `loan.created` to `AUDIT_ACTIONS`; make 2.3 pass

## 3. Pure accounting module (`lib/accounting/owners.ts`)

- [x] 3.1 Write failing tests `lib/accounting/owners.test.ts`: `balanceLabel` (+/−/0), `sharePercent` (40/100 → 40, 1/3, total 0 → 0), `setInForce` (2026-01 vs 2026-06 sets, replaced sets ignored, none before first), `ownerStatus` (current / new / former + `leftMonth`, future set ignored), `shareHistory` (only changed versions, newest first, includes move to 0), `oldestDueMonth` (partly paid → 2026-09, balance ≤ 0 → null), `splitPayout` (≤ owed, > owed, balance negative → payout 0), `statement` (PRD §10 worked example: BF 2989440 → closing −500000; empty range; voided + reversal keep running balance; `latest`; totals per type), `advanceLimit` (avg of last 3, none → null), `paidOut` (excludes voided, by year), `entitlementTotal` (by period year)
- [x] 3.2 Implement `lib/accounting/owners.ts`; confirm 100 % coverage with `pnpm test:coverage`

## 4. Data model & migration

- [x] 4.1 Write failing integration tests `tests/integration/db/owners-schema.test.ts`: two name-only owners allowed, same user twice refused, ledger `amount_paisa = 0` refused, positive PAYOUT refused, PAYOUT without fund refused, second OPENING per owner refused, `reverses_id` unique, DELETE on `owners` / `share_sets` / `share_set_items` / `owner_ledger_entries` / `loans` raises, insert into CLOSED period raises `PERIOD_CLOSED`, void-only UPDATE in a CLOSED period allowed, amount UPDATE in a CLOSED period raises, two active share sets for one month refused, `units < 0` refused
- [x] 4.2 Add Prisma models/enums `Owner`, `ShareSet`, `ShareSetItem`, `OwnerLedgerEntry`, `Loan` (`LedgerType`, `PayMethod`, `LoanStatus`) per design D1 with relations on `Property`, `User`, `Period`, `FundAccount`, all FKs `onDelete: Restrict`
- [x] 4.3 `prisma migrate dev --create-only --name owners`; append CHECKs, partial unique indexes, `block_closed_period_ledger()` trigger (D2), `financial_no_delete()` triggers and `REVOKE DELETE`; apply + `prisma generate`
- [x] 4.4 Add the five tables to `tests/helpers/db.ts` TRUNCATE list; extend `tests/helpers/factory.ts` with `createOwner`, `createShareSet`, `createLedgerEntry`, `createLoan`; make 4.1 pass

## 5. Fund balance integration (`master-data`)

- [x] 5.1 Write failing tests: `lib/accounting/totals.test.ts` for `fundBalance(opening, income, expense, ledger, loans)` and integration `tests/integration/api/fund-balance-ledger.test.ts` (spec scenario: 1370000 → payout 400000, voided advance 100000, loan 200000 → 770000; `FUND_NEGATIVE` warning on a new expense sees the payout)
- [x] 5.2 Extend `fundBalance` and `fundMovements` (ledger Σ by fund, ACTIVE loan Σ by fund) in `lib/master-data/fund-service.ts`; make 5.1 and existing master-data tests pass

## 6. Owners (`owners`)

- [x] 6.1 Write failing integration tests `tests/integration/api/owners.test.ts`: list for PRD §2.2 sample (order, `totalUnits` 100, %, tags You / superAdmin / invitePending / noLogin, labels, loan outstanding, former in `formerOwners` with `leftMonth`), new owner appears with 0 units, detail (email/phone, `entitlementPaisa` by year with synthetic ENTITLEMENT rows, `paidOutPaisa` excludes voided, share history, balance = statement closing), `year` out of range → 422, unknown / malformed / other-property id → 404, create linked (name defaulted) and name-only, name required, `USER_ALREADY_OWNER`, PATCH rename + unlink writes `owner.updated` with before/after, no-op PATCH → no audit, reorder, DELETE → 405, Owner 200 on reads and 403 on writes, anonymous 401
- [x] 6.2 Implement `lib/owners/dto.ts`, `lib/owners/owner-service.ts` (`listOwners`, `getOwnerDetail`, `createOwner`, `updateOwner`; balances + loans via one `groupBy` each)
- [x] 6.3 Implement routes + schemas `owners` (GET, POST) and `owners/[id]` (GET, PATCH) with `await connection()` on GETs; make 6.1 pass

## 7. Share sets (`owner-shares`)

- [x] 7.1 Write failing integration tests `tests/integration/api/owner-shares.test.ts`: gift scenario 201 and 2026-05 still 50, blank reason 422, all zero 422, duplicate owner 422, foreign owner 422, closed month 409 `PERIOD_CLOSED`, month on/before latest closed 409, next month allowed, two months ahead 422, same-month replace (both in timeline, first `replaced`), concurrent same-month saves → one active, omitted owners get 0, `share_set.saved` audit with before/after + reason, timeline order and fields, idempotent replay, Owner 403 on POST and 200 on GET
- [x] 7.2 Implement `lib/owners/share-service.ts` (`listShareSets`, `saveShareSet` with advisory lock + replace) and routes `owners/shares` (GET, POST); make 7.1 pass

## 8. Ledger: opening, payouts, advances, loans (`owner-ledger`, `loans`)

- [x] 8.1 Write failing integration tests `tests/integration/api/owner-opening.test.ts`: create, edit (one row), posted in earliest period, any CLOSED period → `OPENING_LOCKED`, zero amount 422, `ledger.opening_set` audit, Owner 403
- [x] 8.2 Implement `setOpening` in `lib/owners/ledger-service.ts` and route `owners/[id]/opening` (PUT); make 8.1 pass
- [x] 8.3 Write failing integration tests `tests/integration/api/payouts.test.ts`: full balance → Settled, `EXCEEDS_BALANCE` details, split ADVANCE (two entries, balance −494415), split LOAN (PAYOUT + loan, balance 0, `loan.created`), balance ≤ 0 with split → only advance/loan, no split when nothing owed → 409, reference required for BANK/BKASH/NAGAD and not for CASH, inactive fund 422, date after tomorrow 422, `NO_OPEN_PERIOD`, posted in latest open period, `FUND_SHORT` and `HOUSE_FUND_SHORT` warnings, receipt attachment linked (bad magic bytes → 422 and nothing written), idempotent replay, two concurrent payouts of the full balance → one succeeds and one gets `EXCEEDS_BALANCE`, audit atomic, Owner 403
- [x] 8.4 Implement `lib/owners/loan-service.ts` (`createLoanInTx`, `loanOutstandingByOwner`), `createPayout` in `ledger-service.ts` (owner `FOR UPDATE`, `lockPeriod`, `splitPayout`), generalise `linkAttachments`/`prepareAttachments` with `entityType`, widen presign permission to `transaction.create | payout.create | advance.create`; route `payouts`; make 8.3 pass and keep `attachments.test.ts` green
- [x] 8.5 Write failing integration tests `tests/integration/api/advances.test.ts`: reason required, `isSelf` for own owner, over-limit flagged with `ADVANCE_OVER_LIMIT { limitPaisa }` (3 closed months of ENTITLEMENT), no closed months → not flagged, `NO_OPEN_PERIOD`, idempotent, `ledger.advance_created`, Owner 403
- [x] 8.6 Implement `createAdvance` and route `advances`; make 8.5 pass

## 9. Ledger: void, adjustment, statement (`owner-ledger`)

- [x] 9.1 Write failing integration tests `tests/integration/api/ledger-void.test.ts`: void payout → REVERSAL (+amount, same fund, latest open period, `reversesId`), owner + fund balances restored, original in a now-CLOSED period still voidable, twice → `ALREADY_VOIDED`, ENTITLEMENT / OPENING / ADJUSTMENT / REVERSAL → `NOT_VOIDABLE`, blank reason 422, `NO_OPEN_PERIOD`, unknown id 404, concurrent voids → one reversal, audit failure rolls back, Owner 403
- [x] 9.2 Implement `voidLedgerEntry` and route `ledger/[id]/void`; make 9.1 pass
- [x] 9.3 Write failing integration tests `tests/integration/api/owner-adjustments.test.ts`: ± amount in latest open period with `referenceMonth`, no fund effect, zero 422, reference after latest open 422, reason required, idempotent, `ledger.adjustment_created`, Owner 403
- [x] 9.4 Implement `createOwnerAdjustment` and route `adjustments`; make 9.3 pass
- [x] 9.5 Write failing integration tests `tests/integration/api/owner-statement.test.ts`: PRD §10 worked example, default range (Jan this year → latest, frozen clock), `from > to` 422, empty range, voided + reversal rows, row fields (recordedBy, fundAccountName, attachments, referenceMonth, isSelf, flagged), `latest` closing = detail balance, totals per type, Owner 200 for any owner
- [x] 9.6 Implement `ownerStatement` and route `owners/[id]/statement`; make 9.5 pass

## 10. Swagger

- [x] 10.1 Extend `tests/integration/api/openapi.test.ts` to assert every new path + method (`/owners`, `/owners/{id}`, `/owners/{id}/opening`, `/owners/{id}/statement`, `/owners/shares`, `/payouts`, `/advances`, `/adjustments`, `/ledger/{id}/void`) is in `/api/v1/openapi.json`, with `Idempotency-Key` on payouts, advances, adjustments and share sets
- [x] 10.2 Import every new `schema.ts` in `app/api/v1/openapi.ts`; make 10.1 pass; open `/api/v1/docs` on the dev server and confirm the "Owners" tag renders

## 11. Seed

- [x] 11.1 Write failing test additions in `tests/integration/scripts/seed.test.ts`: `SEED_DEMO=true` creates the 5 PRD §2.2 owners (admin linked as Rayhan), 2026-01 and 2026-06 share sets, once across two runs; default seed creates no owners
- [x] 11.2 Implement the demo owners in `scripts/seed.ts`; make 11.1 pass

## 12. i18n & shell (`owners-ui`)

- [x] 12.1 Add all Owners strings (nav, list, tags, labels, summary, statement, legend, print, change shares, add/edit, opening, pay/advance drawer, excess dialog, void, adjustment, warnings, toasts, empty states — PRD §8 wording) to `lib/i18n/en.ts` and `lib/i18n/bn.ts`; keep the parity test green
- [x] 12.2 Write failing UI tests in `components/app/shell.test.tsx`: Owner and Super Admin see "Owners"; and a HomeDesk test: "Statement →" links to the viewer's owner detail only when linked
- [x] 12.3 Add the Owners nav item (`UserGroupIcon`) to `ShellNav` and the `ownerId` shortcut to `HomeDesk` + `app/[lang]/(app)/page.tsx`; make 12.2 pass

## 13. Owners UI

- [x] 13.1 Write failing UI tests `components/owners/owners-list.test.tsx`: cards in order with %, units, tags, label word + amount, loan "None"; viewer card first on mobile (CSS order class) ; former section hidden when empty; empty state with Add owner for admin; Owner sees no Change shares / Add owner
- [x] 13.2 Implement `app/[lang]/(app)/owners/page.tsx` (Suspense, `requirePagePermission('owner.view')`, one `Promise.all`), `OwnersView`, `OwnerCard`, share-timeline sheet, `components/owners/format.ts`; make 13.1 pass
- [x] 13.3 Write failing UI tests `components/owners/change-shares.test.tsx`: live % and total, reason required message, all-zero message, effective month options only open + next, confirmation lists before → after and former-owner callout, toast on success
- [x] 13.4 Implement `ChangeSharesDialog`; make 13.3 pass
- [x] 13.5 Write failing UI tests `components/owners/owner-forms.test.tsx`: Add owner link-a-user vs name-only, "Give shares now" after save, Edit owner has no delete, Opening dialog sign choice
- [x] 13.6 Implement `OwnerFormDialog` (add/edit) and `OpeningDialog`; make 13.5 pass
- [x] 13.7 Write failing UI tests `components/owners/owner-detail.test.tsx`: summary strip figures + year switcher updates URL, share history rows, statement BF/closing rows, voided row struck through with Void tag, row detail panel (reversal links original), legend, empty-range message, admin-only Pay / Record advance / More / Void, Pay disabled with "Open a month first" when no open month, Opening menu item hidden once a month is closed
- [x] 13.8 Implement `app/[lang]/(app)/owners/[id]/page.tsx` (`notFound()`), `OwnerDetail`, `StatementTable` (sticky first columns on mobile, row detail sheet, from/to pickers via URL); make 13.7 pass
- [x] 13.9 Write failing UI tests `components/owners/pay-drawer.test.tsx`: balance panel + Use full balance, empty amount + "Nothing is owed" when balance ≤ 0, reference required except Cash, fund / House Fund warnings, `EXCEEDS_BALANCE` → excess dialog with Payout / Excess and three choices that re-submit with `splitExcessAs`, advance mode requires reason and shows flagged warning, one Idempotency-Key per open drawer, toast text
- [x] 13.10 Implement `PayDrawer` (pay + advance modes, reusing `AttachmentPicker`, `parseAmount`, `DateField`); make 13.9 pass
- [x] 13.11 Write failing UI tests `components/owners/ledger-dialogs.test.tsx`: Void dialog text with amount + open month, Post reversal disabled until reason, toast; Adjustment dialog sign + reference month + reason
- [x] 13.12 Implement `VoidLedgerDialog` (via `ConfirmDialog` rules) and `AdjustmentDialog`; make 13.11 pass
- [x] 13.13 Implement the print view `app/[lang]/(print)/owners/[id]/statement/print/page.tsx` (`generateMetadata` title `BariHisab-Statement-{OwnerName}-{From}-{To}`, print CSS with page counters, auto `window.print()` client island, viewer language + Bangla digits) and wire the PDF button; add a UI test that the print table equals the screen table for the same data

## 14. End-to-end (Playwright)

- [x] 14.1 Add `e2e/db.ts` helpers if needed (e.g. `latestOpenMonth`); write `e2e/owners.spec.ts` (serial, runs after `income-expenses.spec.ts`): admin adds a linked owner (the `nasrin` owner user) and a name-only owner → Change shares with reason (confirmation before → after, toast) → sets openings → detail shows Owed → Pay full balance by bKash (toast, Settled) → Pay over the balance → excess dialog → Record excess as an advance (Payout + Advance rows, Advance outstanding) → Void the advance with reason (Void tag, Reversal row) → Balance adjustment → PDF opens the print view with the expected title → Owner logs in, sees the list tagged "You", opens the statement, sees no admin controls, and `POST /api/v1/payouts` returns 403
- [x] 14.2 Add `/bn/owners` and `/bn/owners/[id]` desktop and 360 px screenshots to `e2e/visual.spec.ts` (Bangla digits, no horizontal body scroll, bottom nav fits)
- [x] 14.3 Run `pnpm test:e2e` until green; save screenshots under `.context/screens/`

## 15. Verification

- [x] 15.1 Run `pnpm typecheck`, `pnpm lint`, `pnpm test` (unit + integration + ui) and `pnpm test:coverage` (100 % on `lib/accounting/**` and `lib/money.ts`)
- [x] 15.2 Run `pnpm build` (Cache Components prerender passes for `/[lang]/owners`, `/[lang]/owners/[id]` and the print route)
- [x] 15.3 Manual check on the dev server at 360 px and desktop in both languages: walk Owners PRD flows 6.1–6.5 and confirm statement closing = card balance and fund balances move as expected (done via Playwright on the production build: flows 6.1–6.5 in `e2e/owners.spec.ts`, bn/en desktop + 360 px screenshots in `.context/screens/`; fund movement asserted in integration tests)
- [x] 15.4 Run `openspec validate add-owners --strict`
