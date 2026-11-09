## Why

BariHisab has no way to know who is calling it. Every later module (income, payouts, periods, complaints) depends on an invite-only login, revocable sessions and a server-side `can(user, permission)` check, so the Phase 0 / Week 1 auth foundation must land first. This change ships every P1 item of the Authentication & Authorization PRD (`docs/barihishab_authentication_autorization.md`) using better-auth, with a short-lived JWT access token and a long-lived, revocable refresh token.

## What Changes

- **Data model**: Prisma migration for `properties` (one seeded row), `users`, `user_roles`, `sessions` (refresh-token store), `auth_tokens`, `audit_logs` (INSERT-only), `email_outbox`; `citext` usernames/emails, partial indexes, DB-level `REVOKE UPDATE, DELETE` on `audit_logs`.
- **better-auth server instance** (`lib/auth/`) on the Prisma adapter with the `username` plugin, Argon2id password hashing (custom `hash`/`verify`), public sign-up disabled, and built-in rate limiting. better-auth owns credential verification and user/account rows; BariHisab-specific rules (lockout, status, invite, audit, outbox) are layered on top.
- **Token model (hybrid)**: on login a signed **JWT access token (15 min)** and an opaque **refresh token** are issued as httpOnly cookies. The refresh token is stored only as a SHA-256 hash in `sessions`, so it is revocable. With "Remember me" the refresh token lives **30 days**; without it it is a browser-session cookie that expires after 12 h idle / 7 days absolute. Refresh rotates the refresh token (reuse detection revokes the whole chain).
- **Auth APIs** under `/api/v1/auth/*`: `login`, `logout`, `logout-all`, `refresh`, `session`, `forgot`, `reset/:token` (GET), `reset`, `invite/:token` (GET), `accept-invite`.
- **Self-service APIs** under `/api/v1/me`: `GET/PATCH /me`, `POST /me/password`, `GET /me/sessions`, `DELETE /me/sessions/:id`.
- **User management APIs** under `/api/v1/users`: list/search/filter, create (+invite), get, update, `PUT roles`, deactivate, reactivate, resend-invite, revoke-invite, revoke-sessions; last-Super-Admin guard (`409 LAST_SUPER_ADMIN`).
- **Audit API**: `GET /api/v1/audit?category=auth`.
- **RBAC**: `lib/permissions.ts` role→permission map and `can()`; `requireAuth()` / `requirePermission()` helpers for route handlers, server actions and page loaders; `proxy.ts` only checks "logged in" and refreshes the access token.
- **Security controls**: account lockout (5 fails → 15 min), per-IP and per-identifier rate limits, CSRF (double-submit token + `Origin` check), safe `next` redirect, generic errors (no enumeration), secure headers, `noindex`.
- **Email**: transactional outbox + worker sending through **Resend**; templates `INVITE`, `RESET`, `PASSWORD_CHANGED` in `bn` and `en`.
- **Bootstrap**: idempotent seed script creating the first Super Admin from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_USERNAME` and printing a one-time invite link.
- **Frontend** (design-system compliant, bn default + en toggle): `/login`, `/forgot`, `/reset/[token]`, `/invite/[token]`, role-aware `/` dashboard shell, `/admin/users`, `/me`, plus 401/403 pages.
- **Tests**: Vitest unit tests (`can()`, token/JWT logic, lockout, validators), integration tests against a real test Postgres for every endpoint incl. 401/403 paths, React Testing Library component tests for auth forms, Playwright E2E for the main flows.
- "Registration" is delivered as the **invite flow** (Admin creates user → user accepts invite and sets password). No public sign-up is added.

## Capabilities

### New Capabilities

- `auth-session`: login (username or email), JWT access token + rotating refresh token lifecycle, remember-me, logout, logout-all, session endpoint, lockout, rate limiting, CSRF, password hashing. (Auth PRD AUTH-01..05, §8)
- `invite-onboarding`: invite creation, invite validation, accept-invite (the "registration" door), resend/revoke invite, first Super Admin seed. (INV-01..05, BOOT-01..02)
- `password-recovery`: forgot password, reset token validation, reset, change own password, revoke-other-sessions on change. (PWD-01..04, AUTH-06)
- `rbac`: role→permission map, `can()`, 401/403 semantics for APIs and pages, client-side permission hints, property scoping. (RBAC-01..06, §2 hard rules)
- `user-management`: Super Admin create/list/search/edit users, change roles, deactivate/reactivate, force logout, last-Super-Admin guard. (USR-01..05, §2 hard rules 1–5)
- `self-profile`: `/me` profile read/update, own session list and single-session revoke. (USR-06, AUTH-07 subset)
- `auth-audit`: append-only audit log of auth and user events, audit read endpoint. (AUD-01..02)
- `email-outbox`: transactional outbox, Resend worker, bilingual auth templates. (EML-01)
- `auth-ui`: screens A1–A7 per design system, bilingual, accessible, 360px-ready. (Auth PRD §4)

### Modified Capabilities

_None — `openspec/specs/` is empty; this is the first spec-bearing change._

## PRD coverage

- **Auth PRD** (`docs/barihishab_authentication_autorization.md`): §2 Roles & Permissions, §3 User Flows, §4 Screens, §5 requirements AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07 (list + revoke one; device/browser/IP only), INV-01..05, PWD-01..04, USR-01..06, RBAC-01..06, BOOT-01..02, AUD-01..02, EML-01, §6 Data Model, §7 API Endpoints, §8 Security, §9 Acceptance criteria.
- **Main PRD** (`docs/barihishab_management_README.md`): §4 Users, Roles & Permissions; §6.1 AUTH-01..05, USR-01..02; data model rows `user_roles`, `auth_tokens`, `properties`, `audit_logs`, `email_outbox`; §8 Security — Auth; outbox pattern.
- Note: the two PRDs number AUTH-xx differently. Specs cite the **Auth PRD** IDs.

## Deviations from PRD (flagged)

- **Token model**: PRD §8 specifies an opaque server-side session cookie `bh_session`. Per user decision this change uses a **JWT access token (15 min) + hashed, revocable refresh token in `sessions`**. Revocation latency for an already-issued access token is therefore up to 15 min, mitigated by a revocation check on privileged/admin endpoints and on every refresh (see design.md).
- **Refresh lifetime**: 30 days with "Remember me" (matches AUTH-02); without it, 12 h idle / 7 days absolute (PRD §8 unchanged).
- **Open questions resolved**: Better Auth library (PRD §9 Q1) — chosen; email provider (Q2) — Resend. Admin manual unlock (Q4) — not in this change. Role change Super Admin → Owner (Q5) — sessions of that user are revoked (PRD §3.4 already says so).

## Out of scope

- 2FA / TOTP (AUTH-08, P3); Accountant and Viewer roles (P3 — map rows only, no UI).
- Public sign-up, social login, SMS OTP, phone-number login, multi-house switching.
- Bearer tokens for a mobile app (the access JWT is designed to be reusable later, but no bearer flow ships).
- AUTH-07 "IP city" geolocation (P2); INV-06 "Invites waiting" dashboard block (P2).
- Admin manual unlock of a locked account.
- Financial dashboard blocks on A5 (fund, reconciliation, requests) — only the role-aware shell and the "pending invites" count ship here.
- Breached-password top-10k list check is included as a bundled static list; live HIBP API lookup is out of scope.

## Impact

- **New dependencies**: `@node-rs/argon2`, `jose` (JWT sign/verify, edge-safe for `proxy.ts`), `resend`, `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `@playwright/test`. `better-auth` is already declared; `pnpm install` must be run in this worktree (node_modules is incomplete).
- **New env**: `AUTH_JWT_SECRET`, `BETTER_AUTH_SECRET` (existing), `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_USERNAME`, `DATABASE_URL_TEST`.
- **Code**: new `lib/auth/*`, `lib/permissions.ts`, `lib/audit.ts`, `lib/email/*`, `lib/i18n/*`, `proxy.ts`, `app/api/v1/{auth,me,users,audit}/**`, `app/(auth)/**`, `app/(app)/**`, `scripts/seed.ts`, `scripts/email-worker.ts`, `components/ui/*`; `app/api/v1/openapi.ts` imports every new `schema.ts`; `app/layout.tsx` metadata (`noindex`, title, lang).
- **Database**: one new migration; the `connection_tests` table is untouched.
- **APIs**: all new, under `/api/v1`, using the existing `ok()`/`fail()` envelope (`{ success:false, error:{code,message,details} }`) — the PRD's bare `{ error }` shape is adapted to the project envelope.
