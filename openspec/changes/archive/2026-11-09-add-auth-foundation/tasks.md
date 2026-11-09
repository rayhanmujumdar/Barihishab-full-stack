## 1. Setup & tooling

- [x] 1.1 Run `pnpm install` in this worktree and confirm `better-auth`, `prisma`, `zod` resolve; read `node_modules/next/dist/docs/` pages for `proxy`, route handlers, `cookies()`, `connection()` before writing code
- [x] 1.2 Add deps: `@node-rs/argon2`, `jose`, `resend`; dev deps: `vitest`, `@vitest/coverage-v8`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`, `@playwright/test`
- [x] 1.3 Create `vitest.config.ts` with `unit`, `integration`, `ui` projects; `tests/setup/integration.ts` globalSetup (apply migrations to `DATABASE_URL_TEST`, per-file truncate helper); add scripts `test`, `test:unit`, `test:int`, `test:ui`, `test:e2e`, `db:seed`, `email:worker`
- [x] 1.4 Add `playwright.config.ts` (webServer = `next dev` on test DB, projects desktop + 360px mobile)
- [x] 1.5 Extend `.env.example` with `AUTH_JWT_SECRET`, `APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_USERNAME`, `DATABASE_URL_TEST`, `TRUST_PROXY`; add `lib/env.ts` zod-validated server env (fails fast, never imported by client code)
- [x] 1.6 Add `lib/clock.ts` (`now()`), used by every time-dependent service so tests can freeze time

## 2. Data model & migration

- [x] 2.1 Write failing integration tests `tests/integration/db/schema.test.ts`: citext uniqueness of username/email, username CHECK rejects `Ka` and `RAHIM`, `user_roles` uniqueness with null property, `audit_logs` UPDATE/DELETE raise, `email_outbox.dedupe_key` unique
- [x] 2.2 Add Prisma models per design D4 (`Property`, `User`, `Account`, `Verification`, `BaSession`, `UserRole`, `Session`, `AuthToken`, `AuditLog`, `EmailOutbox`, `RateLimit`) with snake_case `@@map`/`@map`, enums and indexes
- [x] 2.3 Create migration; hand-edit SQL for `CREATE EXTENSION citext`, username CHECK, partial indexes, `user_roles` coalesce unique index, audit trigger + `REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM PUBLIC`
- [x] 2.4 Run `pnpm db:migrate` + `db:generate`; make 2.1 pass

## 3. RBAC core (`rbac`)

- [x] 3.1 Write failing unit tests `lib/permissions.test.ts`: Owner has exactly 4 keys, Super Admin all 14, union across roles, ACCOUNTANT/VIEWER empty, unknown role ignored (100% coverage target)
- [x] 3.2 Implement `lib/permissions.ts` (`ROLE_PERMISSIONS`, `Permission`/`Role` types, `permissionsFor(roles)`, `can(user, permission, resource?)`)
- [x] 3.3 Write failing unit tests for `lib/auth/safe-redirect.ts` (`/x` ok; `//x`, `/\x`, `https://x`, empty → `/`)
- [x] 3.4 Implement `lib/auth/safe-redirect.ts`

## 4. Credentials, password policy & tokens (`auth-session`)

- [x] 4.1 Write failing unit tests `lib/auth/password-policy.test.ts`: 7/129 chars rejected, equals username/email (case-insensitive) rejected, `password123` rejected, valid passes
- [x] 4.2 Add `lib/auth/data/common-passwords.txt` (top-10k) and implement `lib/auth/password-policy.ts`
- [x] 4.3 Write failing unit tests `lib/auth/hash.test.ts`: Argon2id encoded output, verify true/false, `needsRehash` detects old params
- [x] 4.4 Implement `lib/auth/hash.ts` with `@node-rs/argon2` (m=19456, t=2, p=1)
- [x] 4.5 Configure `lib/auth/better-auth.ts` (Prisma adapter, model/field mapping, `username` plugin, `disableSignUp`, custom hash/verify, `verification.storeIdentifier: "hashed"`) and `lib/auth/credentials.ts` wrapper over `auth.$context` (find by username/email, verify password, set password, needsRehash)
- [x] 4.6 Write failing unit tests `lib/auth/tokens.test.ts`: access JWT sign/verify, expiry at 15 min, tampered signature rejected, wrong `ver` flagged; refresh token generation is 32 bytes base64url and hash is SHA-256 hex; constant-time compare; CSRF HMAC derive/verify (100% coverage target)
- [x] 4.7 Implement `lib/auth/tokens.ts` (jose HS256, refresh generate/hash, CSRF derive) and `lib/auth/cookies.ts` (set/clear `bh_at`, `bh_rt`, `bh_csrf` with remember/no-remember variants)
- [x] 4.8 Write failing integration tests `tests/integration/auth/session-service.test.ts`: create session (remember 30 d / no-remember 12 h idle + 7 d absolute), rotate, reuse → family revoked, 30 s grace returns successor, revoke one/all, idle expiry slides, `last_seen_at` throttled to 5 min
- [x] 4.9 Implement `lib/auth/session-service.ts`
- [x] 4.10 Write failing integration tests `tests/integration/auth/rate-limit.test.ts`: 11th IP request in 60 s blocked with retry-after, 6th per-identifier blocked, window resets
- [x] 4.11 Implement `lib/auth/rate-limit.ts` (Postgres fixed window) and `lib/auth/request-meta.ts` (IP with `TRUST_PROXY`, user agent)

## 5. Shared API plumbing

- [x] 5.1 Write failing unit tests for `lib/api/errors.ts` catalogue (each code → status + bn/en message) and `lib/auth/csrf.ts` (Origin mismatch → `CSRF_INVALID`, missing/wrong header → `CSRF_INVALID`, valid passes)
- [x] 5.2 Implement `lib/api/errors.ts`, `lib/auth/csrf.ts`, and a zod → `422 VALIDATION_FAILED` `details.fields` mapper
- [x] 5.3 Write failing integration tests for `lib/auth/guard.ts`: no token → 401; valid token missing permission → 403; strict mode with revoked session → 401; strict mode with bumped `token_version` → 401; inactive user → 401
- [x] 5.4 Implement `lib/auth/guard.ts` (`getAuth`, `requirePermission`, `withAuth(handler, { permission, strict, csrf })`) and `lib/audit.ts` (`audit(tx, {...})`, strips secret fields)
- [x] 5.5 Implement `lib/email/outbox.ts#enqueue(tx, …)` with dedupe key (tests in group 10)

## 6. Login, refresh, session, logout APIs (`auth-session`)

- [x] 6.1 Write failing integration tests `tests/integration/api/auth-login.test.ts`: username/email any case → 200 + cookies + audit success; unknown/wrong/INACTIVE/INVITED → identical 401 body; 3rd failure `attemptsLeft=2`; 5th → 423 with `retryAfter`; correct password while locked → 423; lock expiry (frozen clock) → 200; counter reset on success; rehash on login; foreign Origin → 403; 429 paths
- [x] 6.2 Implement `app/api/v1/auth/login/{route,schema}.ts` + `lib/auth/login-service.ts` (dummy-hash verify for unknown users, fixed failure delay, atomic counter update)
- [x] 6.3 Write failing integration tests for refresh (rotation, reuse → family revoked + 401 + cookies cleared, deactivated user → 401, page-mode `?next=` redirect, failure redirects to `/login`), `GET /auth/session` (200 with csrfToken / 401), logout (204, cookies cleared, refresh dead, audit), logout-all (all sessions revoked, second session refresh 401, CSRF required)
- [x] 6.4 Implement `app/api/v1/auth/{refresh,session,logout,logout-all}/{route,schema}.ts`
- [x] 6.5 Write failing test that `/api/auth/sign-up/email` and other better-auth paths are not routable (404) and that no route creates a user without `user.create`
- [x] 6.6 Implement `proxy.ts` (edge-safe JWT check, public path list, page refresh redirect, login redirect with safe `next`, APIs pass through) and its unit tests with mocked `NextRequest`

## 7. Invite onboarding & bootstrap (`invite-onboarding`)

- [x] 7.1 Write failing integration tests: `GET /auth/invite/:token` valid → 200 payload; expired (72 h + 1 s) → 410 `TOKEN_EXPIRED` with `invitedBy`; used/revoked → 410 `TOKEN_USED`; unknown → 410 `TOKEN_EXPIRED`
- [x] 7.2 Write failing integration tests: `POST /auth/accept-invite` success (ACTIVE, locale saved, cookies, token used, `auth.invite.accepted`), second use → 410, weak password → 422
- [x] 7.3 Implement `lib/auth/token-service.ts` (issue/revoke-open/consume INVITE & RESET, hashed, constant-time) and `app/api/v1/auth/{invite/[token],accept-invite}/{route,schema}.ts`
- [x] 7.4 Write failing integration tests `tests/integration/scripts/seed.test.ts`: first run creates property + 1 SUPER_ADMIN INVITED + token + printed URL; second run changes no counts; missing env exits non-zero with message
- [x] 7.5 Implement `scripts/seed.ts` (idempotent, prints invite URL, enqueues email) and `db:seed` script

## 8. Password recovery (`password-recovery`)

- [x] 8.1 Write failing integration tests: `POST /auth/forgot` real/unknown/inactive → identical 202, only ACTIVE queues RESET; older tokens revoked; 4th request in an hour queues nothing; `GET /auth/reset/:token` valid/expired (61 min)/voided
- [x] 8.2 Write failing integration tests: `POST /auth/reset` → 204, all sessions revoked, lock + counter cleared, PASSWORD_CHANGED queued, `auth.password.reset`, new session cookies; token single-use
- [x] 8.3 Implement `app/api/v1/auth/{forgot,reset,reset/[token]}/{route,schema}.ts` + `lib/auth/password-service.ts` (bump `token_version`, set `password_changed_at`)

## 9. Self profile APIs (`self-profile`, `password-recovery`)

- [x] 9.1 Write failing integration tests: `GET /me` (200, no secrets; 401 anon); `PATCH /me` Owner phone ok, Owner email/username → 403 with nothing changed, Super Admin username ok, invalid BD phone → 422; `POST /me/password` wrong current → 401 + counts toward lock, success → 204 + other sessions revoked + current kept + email queued
- [x] 9.2 Write failing integration tests: `GET /me/sessions` returns caller's active sessions with exactly one `current`; `DELETE /me/sessions/:id` own → 204, foreign → 404, current → cookies cleared
- [x] 9.3 Implement `app/api/v1/me/{route,schema}.ts`, `me/password`, `me/sessions`, `me/sessions/[id]` and shared `lib/validation/user-fields.ts` (username, email, BD phone, locale, names)

## 10. Email outbox & Resend worker (`email-outbox`)

- [x] 10.1 Write failing unit tests for templates `lib/email/templates/*.test.ts`: INVITE/RESET/PASSWORD_CHANGED in bn and en, correct link path, expiry text, no token outside the link
- [x] 10.2 Implement `lib/email/templates/{invite,reset,password-changed}.ts` and `lib/email/render.ts`
- [x] 10.3 Write failing integration tests `tests/integration/email/worker.test.ts` with a fake transport: success → SENT + provider id + token scrubbed; failure backoff increments attempts; 5 failures → FAILED; INACTIVE recipient → FAILED `RECIPIENT_INACTIVE`; two concurrent workers never double-send (SKIP LOCKED); dedupe key prevents second enqueue; enqueue rolls back with its transaction
- [x] 10.4 Implement `lib/email/transport.ts` (`ResendTransport`, `ConsoleTransport` when no key and not production), `scripts/email-worker.ts` (claim/send/backoff loop, masked errors), `email:worker` script

## 11. User management APIs (`user-management`)

- [x] 11.1 Write failing integration tests for `POST /users`: valid → 201 INVITED + role + INVITE token + outbox + `user.created` + `auth.invite.sent` in one transaction; duplicate username/email (any case) → 409; invalid fields → 422 with `details.fields`; `whatsappSameAsPhone`; ACCOUNTANT role → 422; Owner → 403
- [x] 11.2 Write failing integration tests for `GET /users` (q on name/username/email/phone, role & status filters, cursor pagination 60 → 50 + 10, no secrets) and `GET /users/:id` (200/404)
- [x] 11.3 Write failing integration tests for `PATCH /users/:id` (audit before/after), `PUT /users/:id/roles` (last Super Admin → 409 `LAST_SUPER_ADMIN`, self-demote → 409 `CANNOT_REMOVE_OWN_ADMIN`, sessions revoked, `token_version` bumped), concurrent demotion of two last admins → exactly one succeeds
- [x] 11.4 Write failing integration tests for deactivate (reason required, sessions + tokens revoked, login then 401, last admin 409), reactivate (ACTIVE vs INVITED), resend-invite (old token dead, 409 `NOT_INVITED`), revoke-invite (204, link dead), revoke-sessions (204)
- [x] 11.5 Write failing integration test: Owner calls every `/users/*` endpoint → 403 with no data; anonymous → 401
- [x] 11.6 Implement `lib/users/user-service.ts` (serializable last-admin guard) and `app/api/v1/users/{route,schema}.ts`, `users/[id]`, `users/[id]/{roles,deactivate,reactivate,resend-invite,revoke-invite,revoke-sessions}`

## 12. Audit API (`auth-audit`)

- [x] 12.1 Write failing integration tests: each of the 16 actions is written by its flow with IP + user agent; payloads contain no password/token/cookie; `GET /audit?category=auth` newest-first, filters, pagination; Owner → 403
- [x] 12.2 Implement `app/api/v1/audit/{route,schema}.ts`

## 13. Swagger registration

- [x] 13.1 Register every new endpoint's request/response/error schemas in its `schema.ts` (cookie auth + `X-CSRF-Token` security schemes) and import all of them in `app/api/v1/openapi.ts`
- [x] 13.2 Add an integration test that fetches `GET /api/v1/openapi.json` and asserts all 26 auth/me/users/audit paths and methods are present; verify manually in `/api/v1/docs`

## 14. Frontend foundation (`auth-ui`)

- [x] 14.1 Read `.agents/skills/barihisab-design-system/SKILL.md`; add design tokens to `app/globals.css` `@theme`; update `app/layout.tsx` (title, `robots: noindex`, `lang` from locale, fonts per design system)
- [x] 14.2 Write failing unit tests for `lib/i18n` (`t()` interpolation, every bn key has an en key and vice versa, default `bn`)
- [x] 14.3 Implement `lib/i18n/{bn,en,index}.ts` and locale resolution (`bh_locale` cookie / `users.locale`)
- [x] 14.4 Write failing UI tests for primitives in `components/ui/` (Field label + `aria-describedby`, ErrorStrip focuses on mount, Button 44px min-height class, Drawer/Dialog focus trap + Esc)
- [x] 14.5 Implement `components/ui/{Button,Input,Field,ErrorStrip,Drawer,Dialog,Tag,Table,LanguageToggle}.tsx`
- [x] 14.6 Implement `lib/api/client.ts` (adds `X-CSRF-Token`, one transparent refresh retry on 401, typed envelope parsing) with unit tests
- [x] 14.7 Add security headers (CSP, HSTS, X-Frame-Options DENY, Referrer-Policy strict-origin) in `next.config.ts` `headers()`

## 15. Public auth screens (`auth-ui`)

- [x] 15.1 Write failing UI tests for LoginForm: submit disabled until both fields filled; 401 → generic message + focus on error strip; `attemptsLeft` hint; 423 → locked message; success navigates to safe `next`
- [x] 15.2 Implement `app/(auth)/layout.tsx` (split wordmark layout) and `app/(auth)/login/page.tsx` (+ redirect to `/` when already logged in)
- [x] 15.3 Write failing UI tests for ForgotForm (same message for any outcome; 429 shows retry text) and implement `app/(auth)/forgot/page.tsx`
- [x] 15.4 Write failing UI tests for ResetForm (live length + match checks gate submit; expired state renders no form) and implement `app/(auth)/reset/[token]/page.tsx`
- [x] 15.5 Write failing UI tests for AcceptInviteForm (welcome + read-only username + expiry kicker; expired message names admin; used state shows Log in; logged-in-as-other shows log-out prompt) and implement `app/(auth)/invite/[token]/page.tsx`

## 16. App shell, admin & profile screens (`auth-ui`, `rbac`)

- [x] 16.1 Write failing UI tests: nav hides Users/Audit and Bookkeeper's desk for Owner; shows them for Super Admin
- [x] 16.2 Implement `lib/auth/server.ts` (`getPageAuth`, `requirePagePermission` → redirect / 403 view), `app/(app)/layout.tsx` (sidebar + mobile bottom nav, user block with logout) and `app/(app)/page.tsx` (A5 shell with pending-invites count for Super Admin)
- [x] 16.3 Write failing UI tests for User management: table renders status tags; drawer submit maps `409 EMAIL_TAKEN` to the email field; last active Super Admin row has Deactivate + role select disabled with tooltip; deactivate dialog requires reason
- [x] 16.4 Implement `app/(app)/admin/users/page.tsx` with search/filters, New user drawer, row actions (edit, resend, revoke invite, deactivate/reactivate, log out everywhere)
- [x] 16.5 Write failing UI tests for Profile & security: Owner sees email/username read-only; change-password requires current password; sessions list marks current; log-out-all redirects to `/login`
- [x] 16.6 Implement `app/(app)/me/page.tsx`
- [x] 16.7 Add 403 "You don't have access" view and replace the create-next-app `app/page.tsx` content (moved into `(app)`)

## 17. End-to-end & verification

- [x] 17.1 Write Playwright specs: seed → accept invite → login (username and email, mixed case); 5 wrong passwords → locked; forgot → reset (ConsoleTransport link) → other context logged out; admin creates Owner → accept → Owner hits `/admin/users` → 403 page and `GET /api/v1/users` → 403; logout-all across two contexts; deactivate logs user out
- [x] 17.2 Playwright visual pass at 360px and desktop in bn and en for A1–A4, A6, A7; save screenshots under `.context/`
- [x] 17.3 Grep-based test asserting no password, token or cookie values are logged (`console.*` spy during integration suite)
- [x] 17.4 Run `pnpm lint`, `tsc --noEmit`, `pnpm test` (coverage: 100% `lib/permissions.ts` + `lib/auth/tokens.ts`, ≥ 90% `lib/auth/**`), `pnpm test:e2e`, `pnpm build`; fix failures
- [x] 17.5 Run a security review of the diff (auth, CSRF, enumeration, token handling) and resolve findings
- [x] 17.6 Walk the Auth PRD §9 acceptance checklist locally and note any item that needs staging (real Resend delivery)

## 18. Form usability: date picker & placeholders (`auth-ui`, `user-management`)

- [x] 18.1 Add shadcn `calendar` + `popover` themed to the design system, and the shared `DateField` (`components/forms/fields.tsx`) with UI tests (placeholder, select, clear, ISO round-trip without day shift)
- [x] 18.2 Replace native `type="date"` birthday inputs on `/me` and in the user drawer with `DateField`; UI test picks a birthday inside the drawer and asserts the PATCH body
- [x] 18.3 Add bilingual `ph.*` placeholder keys (en + bn) and apply them to every free-text input on login, forgot, reset, invite, `/me` and `/admin/users`
- [x] 18.4 Add `todayIsoInDhaka()` to `lib/clock.ts` and evaluate the birthday "not in the future" rule against it (unit tests at 02:00 Dhaka)
- [x] 18.5 E2E: `/me` birthday picker screenshots in bn/en at desktop and 360px (no native date input, popover inside the viewport); users-drawer picker on a 380px-tall viewport overflows and wheel-scrolls
