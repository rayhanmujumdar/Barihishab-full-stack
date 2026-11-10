## Why

Home (`/`, screen S2) is the first screen after login, but today it only shows a greeting, a "Statement →" link, the close reminder, a pending-requests tile and an invites/active-users desk. Owners cannot see where they stand without opening Owners, and the bookkeeper cannot see the House Fund, the reconciliation check (main PRD §5.7) or the day's jobs in one place. Every section Home summarises (Income & Expenses, Owners, Distribution, Advances & Loans, Requests) now exists, so Home can be built on top of their read models without new accounting.

Source: `docs/home_section_PRD.md` (Home PRD v1.0, named by the user) — it refines main PRD S2, §5.7, §8.1 and the `GET /dashboard` row of §9.

## What Changes

- **Greeting header (F1)**: kicker "{House} · {current month}", "Hello, {first name}", Super Admin quick actions **Generate this month's rent** · **+ Income** · **+ Expense** that open the existing Income & Expenses dialogs over Home; "No open month" + Distribution link when none is open.
- **Balance hero (F2)** and **This month for me (F3)** for viewers linked to an owner: balance with Owed / Advance outstanding / Settled, share %, explanation sentence, loan line (G14), **My statement →**; entitlement preview, received, advances (when any), loan outstanding. Hidden for non-owners (G2). First-month and no-share variants (F12).
- **My request strip (F4)**: Pending / Approved request status, plus a one-time Rejected / Paid out notice while the decision is unseen.
- **Bookkeeper's desk (F5)**: House fund (total + each active account), Reconciliation (Balanced / Check with mismatch, **See details** breakdown — main PRD §5.7), Pending requests, Open complaints, Invites waiting (expired flagged). Replaces the current invites/active-users desk.
- **Reminders (F6)**: Close-the-month, Rent status (from the 10th), Approved-not-paid; at most two, most urgent first, each with **Hide today**.
- **The house this month (F7)**: the Distribution staircase for the current month with Draft tag, deficit note and links.
- **Latest activity (F8)**: 6 newest non-voided money events across income, expenses, payouts, advances, loans and loan repayments, linked to their details; **See all →**.
- **Pinned notices (F9)**: block with empty state, backed by a notices provider that returns nothing until the Notices & Complaints section ships (user decision: "seam now, wire later"). The Open complaints tile reads 0 from the same seam.
- **Setup checklist (F12)** for the Super Admin when setup is unfinished.
- **Layout, freshness, loading (F10, F11)**: desktop/mobile order, each block streams and fails independently with skeletons and "Couldn't load {block}. Try again", refresh after actions, pull-to-refresh on mobile, refresh on tab return after 5 minutes.
- **App shell (§4)** (user decision: include): house line under the logo, top-bar primary action (**+ New entry** / **+ Request money**), mobile bottom nav of 5 role-specific items with a **More** sheet holding the remaining sections and **Log out**.
- **API**: new `GET /api/v1/dashboard` — role-aware, one call (main PRD §9 `/dashboard`), registered in Swagger.

### PRD coverage

Home PRD §2.2 G1–G14 (G10 deferred), §3, §4, F1–F12, §7 rules 1–12, §8 messages, §10 acceptance criteria. Main PRD S2, §5.7, §8.1, §9 `GET /dashboard`, PAY-04 (House Fund total), NTC-01 (seam only).

### Out of scope

- Notices & Complaints section itself (tables, pages, publishing, read tracking) — Home only reserves the seam; unread dots and the notices nav badge appear once that section lands.
- P2: Email problems tile (G10), reminder emails from Home, real cash/bank balance variance. P3: sparkline, birthday greeting, PWA shortcut.
- Reports / "Accounts" screen (owner bottom nav slot falls back, see design).
- Fund transfers (PRD flow 6.4 mentions recording one; no transfer feature exists yet).
- Switching Home to a previous month (open question; Home stays on the current month).
- Editing anything in place on Home.

## Capabilities

### New Capabilities
- `home-dashboard`: role-aware Home read model and `GET /api/v1/dashboard` — current month resolution, personal figures, desk tiles, reconciliation breakdown, reminders and their timing, latest activity, setup checklist, notices seam.
- `home-ui`: the Home screen — header and quick actions, hero, this month, request strip, desk, reminders with Hide today, staircase, activity, pinned notices, first-run states, layout, per-block loading/failure and freshness.
- `app-shell`: the shared shell around every page — sidebar house line and badges, top-bar primary action, 5-item role-specific mobile bottom nav with a More sheet.

### Modified Capabilities
- `auth-ui`: "Role-aware home shell (A5)" — the desk is no longer invites/active users; who-sees-what follows Home PRD §3.
- `distribution-ui`: "Home close reminder" — becomes one of the Home reminders (timing, max two, Hide today).
- `owners-ui`: "Navigation and home shortcut" — "Statement →" becomes **My statement →** inside the balance hero.
- `requests-ui`: "Home tie-ins" — pending tile moves into the desk, Approved-not-paid becomes a reminder strip, owner strip per F4; "Navigation and badge" — mobile placement may be the More sheet.
- `advances-loans-ui`: "Navigation" — "phone bottom bar" becomes "mobile navigation (bottom bar or More sheet)".
- `destructive-action-confirm`: "Log out" on mobile moves from the bottom nav into the More sheet; still confirms first.

## Impact

- **Code**: `app/[lang]/(app)/page.tsx`, `app/[lang]/(app)/layout.tsx`, `components/app/HomeDesk.tsx` (replaced by `components/home/*`), `components/app/ShellNav.tsx`; new `lib/home/*` read services and a pure `lib/accounting/reconciliation.ts`; small reuse hooks into `lib/distribution`, `lib/master-data/fund-service`, `lib/owners`, `lib/loans`, `lib/requests`, `lib/transactions`; `components/entries/EntryDrawer.tsx` / `GenerateRentDialog.tsx` take a narrower data type so Home can open them.
- **API**: new `app/api/v1/dashboard/{route,schema}.ts`, registered in `app/api/v1/openapi.ts`. No breaking changes.
- **DB**: no migration (notices seam needs none; Hide today is a per-device cookie).
- **i18n**: new `home.*` and `shell.*` keys in `lib/i18n/en.ts` and `bn.ts`.
- **Tests**: unit (reconciliation, reminder timing, activity merge, bottom-nav selection), integration (`tests/integration/api/dashboard.test.ts`), UI (`components/home/*.test.tsx`, updated `shell.test.tsx`), Playwright `e2e/home.spec.ts`; existing `auth.spec.ts`/`owners.spec.ts`/`requests.spec.ts` assertions on the old Home and bottom nav get updated.
- **Dependency**: the working tree still carries uncommitted Requests files that `origin/development` already has (052fe75); sync the branch with `development` before implementing.
