## Why

Co-owners can see income and expenses today, but nothing answers "what is my share, what has the house owed me, what have I received, and where do I stand?" — and the bookkeeper has no way to change shares or pay an owner. The Owners section (docs/owners_sections_PRD.md, v1.0) is the next P1 slice: it introduces the owner ledger (PRD §5.4) that Distribution and Loans will later post into, so it has to exist before either of them.

## What Changes

- **Owner records**: `owners` table (linked user or name-only, display name, initials, display order, note). Add / edit / reorder / link-unlink a login; owners are never deleted. Owner status (current / new / former) is derived from shares. (Owners PRD F7, F8, F9, G1–G3, G10; OWN-02)
- **Share sets**: versioned share sets (whole units per owner, effective from the 1st of a month, required reason). A second set for the same month replaces the first but stays in history. Effective month must be an open month or the month after the latest period, never closed. Owner share history and house share timeline. (F5, F6; OWN-03, OWN-04; Rules 1–7)
- **Owner ledger**: append-only `owner_ledger_entries` with types `OPENING`, `ENTITLEMENT`, `PAYOUT`, `ADVANCE`, `LOAN_DEDUCTION`, `ADJUSTMENT`, `REVERSAL` (signed paisa). Balance = Σ entries, computed on read, never stored. This change writes `OPENING`, `PAYOUT`, `ADVANCE`, `ADJUSTMENT`, `REVERSAL`; `ENTITLEMENT` and `LOAN_DEDUCTION` are defined for Distribution / Loans to post later. (PRD §5.4; Rules 8–11)
- **Opening balances**: one editable Opening entry per owner until any month is closed. (F10, G11)
- **Pay an owner**: `POST /payouts` with fund account, method (Cash / Bank / bKash / Nagad), reference no. (required except Cash), optional receipt; paying above the positive balance returns `409 EXCEEDS_BALANCE` with a split proposal; re-sent with `splitExcessAs: ADVANCE | LOAN` it records two entries. Soft warnings for fund / House Fund shortfall. Idempotent. (F11, G8; PAY-01–PAY-04; Rules 12–15)
- **Record an advance**: reason required, "Self" tag when the Super Admin advances to themself, soft "above the advance limit" flag. (F12; ADV-01; Rule 16)
- **Void a payout or advance**: posts a `REVERSAL` in the latest open month, marks the original Void; once only; entitlements/loan deductions refused. (F13; Rule 17)
- **Balance adjustment**: owner-specific ± correction with reference month and reason, posted in the latest open month, no House Fund effect. (F14, G7)
- **Minimal loans**: a `loans` record created when payout excess is recorded as a loan; card/detail show outstanding = principal (no repayments yet). (PAY-03 split; ADV-02 disbursement only)
- **House Fund**: fund account balances now also subtract payouts, advances and loan disbursements and add back reversals.
- **Statement**: any month range with Brought forward, running balance, Closing balance, voided rows struck through, row detail; print view that saves as PDF with the PRD file name, in the viewer's language. (F3, F4, G6)
- **UI**: `/[lang]/owners` (cards, tags, Former owners, share timeline, Change shares, Add owner) and `/[lang]/owners/[id]` (summary strip with year switcher, statement, share history, Pay / Record advance / More menu), "Owners" nav item, home "Statement →" shortcut. (F1, F2, F17, G4, G5)
- **RBAC**: 7 new permission keys; Owner gains `owner.view` only.
- Every write audited in the same DB transaction (Owners PRD §11 General).

## Capabilities

### New Capabilities
- `owners`: owner records, derived status (current / new / former), list and detail read models, add / edit / reorder / link.
- `owner-shares`: share sets, effective-month rules, replacement, owner share history and house share timeline.
- `owner-ledger`: ledger entries and computed balance, opening balances, payouts with excess split, advances, voids via reversal, adjustments, statement with running balance.
- `loans`: minimal loan record created from a payout split and its outstanding amount.
- `owners-ui`: owner list, owner detail, statement + print/PDF view, Change shares, Add/Edit owner, Pay/Advance drawer, void and adjustment dialogs, nav and home shortcut.

### Modified Capabilities
- `rbac`: role→permission map adds `owner.view`, `owner.manage`, `share.manage`, `payout.create`, `advance.create`, `ledger.void`, `ledger.adjust` (Super Admin 30 keys, Owner 7).
- `master-data`: fund account balance also reflects owner payouts, advances, their reversals and loan disbursements.
- `attachments`: uploads can also be linked to an owner ledger entry (payout / advance receipt).

## Impact

- **DB**: new tables `owners`, `share_sets`, `share_set_items`, `owner_ledger_entries`, `loans`; new enums; migration with CHECKs, partial unique indexes, no-delete and closed-period triggers on `owner_ledger_entries`.
- **Code**: `lib/accounting/owners.ts` (pure, 100 % coverage), `lib/owners/*` services, `lib/master-data/fund-service.ts`, `lib/attachments/attachment-service.ts`, `lib/permissions.ts`, `lib/audit.ts`, `lib/api/errors.ts`, i18n `en.ts`/`bn.ts`.
- **API** (all `/api/v1`, all in Swagger): `GET/POST /owners`, `GET/PATCH /owners/:id`, `PUT /owners/:id/opening`, `GET /owners/:id/statement`, `GET/POST /owners/shares`, `POST /payouts`, `POST /advances`, `POST /adjustments`, `POST /ledger/:id/void`.
- **UI**: `app/[lang]/(app)/owners/**`, `components/owners/**`, `ShellNav`, `HomeDesk`.
- **Tests**: Vitest unit (accounting), integration (every endpoint), UI (components), Playwright `e2e/owners.spec.ts`.
- **No new dependencies.**

## Out of scope

- Month close, entitlement calculation, largest-remainder split, reopen (Distribution PRD) — Rule 5 and 7 are honoured by Distribution later; this change only stores share sets and accepts `ENTITLEMENT` rows.
- Loan repayments, instalments, loan deductions, loan voiding (Advances & Loans section).
- Money requests (Requests section); "Pay" from Distribution board.
- P2: payment receipt PDF + emails (F15), all §9 notifications, hide-phone setting (G9).
- P3: "I received it" confirmation (F16), per-owner payment details, multi-house view.
- Advance-limit setting UI (default rule only: 1× average entitlement of last 3 closed months; no flag when there are none).
