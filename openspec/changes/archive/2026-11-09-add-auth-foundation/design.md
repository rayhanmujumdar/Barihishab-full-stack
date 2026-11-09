## Context

See proposal.md (Why). Current state of the repo:

- Next.js 16.4 App Router with `cacheComponents: true` — request-time reads need `await connection()`; `middleware.ts` is renamed **`proxy.ts`** (see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`). `forbidden()`/`unauthorized()` are still experimental (`authInterrupts`), so this change does not rely on them.
- Prisma 7 with the `prisma-client` generator (output `lib/generated/prisma`), `@prisma/adapter-pg`, connection URL in `prisma.config.ts`. Only a throwaway `connection_tests` table exists.
- `/api/v1` conventions already in place: `lib/api/response.ts` (`ok()`/`fail()` envelope), `app/api/v1/registry.ts` + `openapi.ts` (zod-to-openapi; each module's `schema.ts` must be imported there), Swagger at `/api/v1/docs`.
- `better-auth@^1.7.18` is declared but this worktree's `node_modules` is incomplete (no better-auth, prisma, zod) — `pnpm install` is the first task.
- No test runner, no UI beyond the create-next-app page, `app/layout.tsx` still has default metadata.
- Verified in better-auth 1.7.18 sources: custom `emailAndPassword.password.{hash,verify}`, `disableSignUp`, `disabledPaths`, `rateLimit.customRules`, `verification.storeIdentifier: "hashed"`, and `auth.$context` exposing `password` and `internalAdapter`. Better-auth **session tokens are stored in plaintext and are not rotated on refresh**; its `cookieCache` (`strategy: "jwt"`) is a cache of the session, not an access/refresh pair.

## Goals / Non-Goals

**Goals:**
- One server-side choke point per request (`getAuth()` → `requirePermission()`) so no handler can forget a check.
- Revocation that is immediate for anything sensitive and bounded (≤ 15 min) for everything else.
- Every auth write is a single DB transaction: data + `audit_logs` + `email_outbox`.
- Tests run against a real Postgres (no Prisma mocks) so constraint, citext and trigger behaviour is exercised.

**Non-Goals:**
- Using better-auth's HTTP handler (`/api/auth/[...all]`) or its client SDK — not mounted.
- Edge/serverless rate limiting across regions (single-node Postgres-backed limiter is enough for v1).
- A separate worker process manager; the email worker is a script runnable by cron/pm2 (pg-boss deferred, see D9).

## Decisions

### D1. better-auth is the identity & credential engine; BariHisab owns token issuance
better-auth is configured (`lib/auth/better-auth.ts`) with the Prisma adapter, `emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 8, maxPasswordLength: 128, password: { hash, verify } }` (Argon2id), the `username` plugin (lowercase normalisation, `^[a-z0-9_.]{3,30}$` validator), `verification.storeIdentifier: "hashed"`, and its own `rateLimit` disabled (our limiter guards `/api/v1/auth/*`, see D5). Our services use `auth.$context` → `password.hash/verify` and `internalAdapter.findAccounts` so better-auth owns *how credentials are stored and verified*. Password **writes** (`setPassword`) hash through better-auth's hasher but write the `accounts` row with the caller's Prisma transaction, because `internalAdapter.updatePassword` can't join the transaction that also writes the token/audit/outbox rows. All better-auth usage is confined to `lib/auth/credentials.ts`.

Token issuance (access JWT + refresh token) is done by `lib/auth/tokens.ts`, **not** by better-auth sessions, because better-auth sessions (a) store the raw token in the DB (violates Auth PRD §6 "stored only as SHA-256 hashes"), (b) don't rotate, so refresh-token reuse can't be detected, and (c) can't express the user's requested 15 min access / 30 d refresh pair without contortion.

- *Alternative A — better-auth native sessions + `jwt` plugin (session token = refresh, plugin JWT = access):* least code, but plaintext session tokens and no rotation/reuse detection. Rejected on security grounds (PRD: "security beats convenience").
- *Alternative B — drop better-auth, hand-roll everything:* contradicts the user's explicit choice and PRD §9 Q1 resolution.

**PRD deviation:** better-auth keeps the password hash in its `accounts` table (`provider_id = 'credential'`, `password` column) instead of `users.password_hash`. `users.password_hash` is therefore omitted; "has a password" = a credential account exists. Behaviour is unchanged.

### D2. Token model
| Token | Format | Lifetime | Storage | Cookie |
|---|---|---|---|---|
| Access | JWT HS256 via `jose`, claims `{ sub, sid, ver, roles, iat, exp }` | 15 min | none (stateless) | `bh_at`, httpOnly, SameSite=Lax, Path=/, Secure (prod), Max-Age 900 |
| Refresh | 32 random bytes, base64url | remember: 30 d absolute; else 12 h idle / 7 d absolute | `sessions.token_hash` = SHA-256 | `bh_rt`, httpOnly, SameSite=Lax, Path=/ (see below), Secure (prod); Max-Age 30 d or session cookie |
| CSRF | 32 random bytes | life of refresh session | HMAC of `sid` (no extra column) | `bh_csrf`, readable by JS, SameSite=Lax |

- `sid` links the access token to its `sessions` row, so sensitive endpoints can check revocation with one indexed lookup (spec auth-session "Immediate revocation").
- `ver` = `users.token_version`; incremented on role change, deactivation, password change. A mismatch on a revocation-checked endpoint → 401. Cheap global kill switch without a blacklist.
- Refresh **rotation with families**: each `sessions` row has `family_id` and `replaced_by_id`. Refresh marks the current row `revoked_reason = 'rotated'`, inserts a new row in the same family. Presenting a token whose row is `rotated` → revoke the whole family (theft signal) and audit `auth.logout_all` with reason `refresh_reuse`. A 30-second grace window tolerates parallel refreshes of the same token (several tabs, or a page load plus an RSC request). Because only hashes are stored, the successor's raw token can't be returned, so each late refresh gets a new *sibling* session in the same family, up to `MAX_GRACE_SIBLINGS = 3` per rotated token. The family stays revocable as one unit, and logout revokes the whole family. The loser of the compare-and-set takes the same grace path instead of failing. Grace decisions are serialised per family with `pg_advisory_xact_lock`.
- The refresh cookie uses `Path=/` (not narrowed) because `proxy.ts` must perform page-navigation refresh; CSRF and SameSite=Lax protect it.
- **Remember-me off:** cookie has no Max-Age (browser-session), row gets `expires_at = min(now+12h idle, created+7d)`; idle window slides on refresh. **Remember-me on:** `expires_at = created + 30 d`, cookie Max-Age 30 d. `last_seen_at` written at most once per 5 min.
- *Alternative — refresh token in localStorage + Authorization header:* XSS-exfiltratable; rejected. API still accepts `Authorization: Bearer <access>` later for mobile (out of scope, but `getAuth()` is written to read either).

### D3. Request pipeline
```
proxy.ts (edge-safe, jose only, no Prisma)
  ├─ public paths (/login, /forgot, /reset/*, /invite/*, /api/v1/auth/{login,forgot,reset*,invite*,accept-invite,refresh}, /api/v1/health*, /api/v1/docs, /api/v1/openapi.json, static) → pass
  ├─ valid bh_at → pass (adds x-request-id)
  ├─ page request, bh_at missing/expired, bh_rt present → 307 to /api/v1/auth/refresh?next=<path> (refresh endpoint rotates + redirects back)
  ├─ page request, nothing valid → 307 /login?next=<path>
  └─ API request, nothing valid → pass through (handler returns 401 UNAUTHENTICATED; proxy never decides permissions)

route handler / server action / page loader
  getAuth(req)            → verify JWT → AuthContext { userId, sid, roles, permissions, locale }
  requirePermission(ctx, 'user.list', { strict: true })
                          → strict = load sessions row by sid + users.status/token_version (spec "Immediate revocation")
  csrf(req)               → for POST/PATCH/PUT/DELETE: Origin === APP_URL && X-CSRF-Token valid
  zod parse               → 422 VALIDATION_FAILED with details.fields
  service(tx)             → prisma.$transaction: data + audit + outbox
```
`lib/auth/guard.ts` exports `withAuth(handler, { permission, strict, csrf })` so each `route.ts` stays declarative. Strict mode is on for every `user.*`, `audit.view.all`, `settings.manage`, `/me/password` and `/me/sessions` route.

For pages, `lib/auth/server.ts` exposes `getViewer()` (strict: live session, ACTIVE, current `token_version`), `requireViewer()` (redirects to `/api/v1/auth/refresh?next=` when a stale access token + refresh cookie exist, else `/login?next=`) and `requirePagePermission(permission)` (returns `null` so the page renders the `<Forbidden>` view in place, never loading protected data). **Implementation finding:** under Cache Components pages stream (PPR), so the HTTP status of a page can't be changed to 403 after the shell is sent — a proxy rewrite with `status: 403` is overwritten with 200 by the page render. APIs keep the enforced 403; the rbac spec was updated accordingly. Session reads sit inside `<Suspense>` and call `await connection()` before any clock-dependent check (runtime prefetch rejects `new Date()` otherwise).

### D4. Data model (Prisma, one migration)
- `properties` (id uuid, name, currency 'BDT', timezone 'Asia/Dhaka', settings jsonb) — one seeded row.
- `users` — better-auth `user` model mapped via `modelName: "users"` + `fields` mapping to snake_case and `additionalFields` for PRD columns: `username citext unique` (CHECK `^[a-z0-9_.]{3,30}$`), `display_username`, `email citext unique`, `email_verified` (better-auth requirement; set true on invite accept), names, birthday `date`, profession, phone, whatsapp, `whatsapp_same_as_phone`, `house_responsibility`, `locale` enum(bn,en), `status` enum(INVITED,ACTIVE,INACTIVE), `failed_login_count int`, `locked_until timestamptz`, `last_login_at`, `password_changed_at`, `token_version int default 0`, `created_by`, timestamps.
- `accounts` — better-auth `account` model (credential password hash lives here).
- `verifications` — better-auth `verification` model (required by better-auth; unused by our flows, identifiers hashed).
- `user_roles` — PK (user_id, property_id, role) with `property_id` nullable → implemented as surrogate id + unique index on `(user_id, coalesce(property_id,'00000000-…'), role)` because Postgres PKs can't contain NULL. **Deviation (technical only).**
- `sessions` — our refresh store: id, user_id, family_id, replaced_by_id, `token_hash char(64) unique`, remember, ip, user_agent, created_at, last_seen_at, idle_expires_at, expires_at, revoked_at, revoked_reason. Partial index `(user_id) WHERE revoked_at IS NULL`. better-auth's own `session` model is mapped to a separate, unused `ba_sessions` table so the adapter schema is complete without colliding.
- `auth_tokens` — id, user_id, type enum(INVITE,RESET), token_hash unique, expires_at, used_at, revoked_at, created_by, created_at; partial index `(user_id, type) WHERE used_at IS NULL AND revoked_at IS NULL`.
- `audit_logs` — id bigserial, actor_id, action, entity_type, entity_id, before/after jsonb, reason, ip inet, user_agent, created_at; index `(created_at desc)`, `(action)`. Migration SQL: `REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM <app_role>` plus a `BEFORE UPDATE OR DELETE` trigger that raises — the trigger makes it hold even if the app connects as the table owner in dev.
- `email_outbox` — id, to_user_id, to_email, template enum, locale, payload jsonb, status enum(QUEUED,SENDING,SENT,FAILED), attempts, next_attempt_at, last_error, sent_at, provider_message_id, `dedupe_key unique`, created_at.
- `rate_limits` — better-auth rate-limit storage table (key, count, last_request).
- `CREATE EXTENSION IF NOT EXISTS citext` in the migration.
- Last-Super-Admin rule enforced in the service inside a `SERIALIZABLE` transaction (`SELECT … FOR UPDATE` on active Super Admin role rows), not a trigger — clearer errors and testable. PRD allows "DB trigger or service check".

### D5. Lockout, rate limits, timing
- Lockout state lives on `users` (`failed_login_count`, `locked_until`), updated atomically (`UPDATE … SET failed_login_count = failed_login_count + 1 … RETURNING`) to avoid races between parallel attempts.
- Rate limits: better-auth's limiter is bound to its own endpoints, which we don't mount, so `lib/auth/rate-limit.ts` implements a fixed-window counter in the same `rate_limits` table (`INSERT … ON CONFLICT DO UPDATE … RETURNING count`): keys `ip:<ip>:auth` (10/60 s) and `id:<lower(identifier)>:login` (5/60 s), `email:<email>:reset` (3/3600 s → silent drop per PWD-03). IP from `x-forwarded-for` first hop only when `TRUST_PROXY=true`; without a trusted proxy the per-IP limit is **skipped** (route handlers can't see the socket address, and a shared `unknown` bucket would let one client lock everyone out). Production behind a proxy must set `TRUST_PROXY=true`.
- Unknown user: still run `argon2.verify` against a fixed dummy hash so response time doesn't reveal existence; plus fixed 250 ms delay on any failure.

### D6. Password policy
`lib/auth/password-policy.ts` (pure): length 8–128, not equal to username/email (case-insensitive), not in `lib/auth/data/common-passwords.txt` (top-10k list, loaded once into a `Set`). Argon2id via `@node-rs/argon2` (prebuilt binaries, no node-gyp) with `{ memoryCost: 19456, timeCost: 2, parallelism: 1 }`; `needsRehash` compares encoded params on login.

### D7. CSRF
Double-submit with a server-derived value: `csrf = base64url(HMAC_SHA256(AUTH_JWT_SECRET, sid))`. Set as readable cookie `bh_csrf` and returned by `/auth/session`. Mutations must send it in `X-CSRF-Token`; server recomputes from the JWT's `sid` (no DB). Pre-session public mutations (login/forgot/reset/accept-invite) check `Origin` only. Allowed origins = `APP_URL` **and the request's own origin** (from `Host`), which browsers can't forge cross-site; this keeps dev servers on other ports and preview URLs working. A thin `lib/api/client.ts` fetch wrapper adds the header and handles one transparent `POST /auth/refresh` retry on 401.

### D8. Email via Resend through the outbox
`lib/email/outbox.ts#enqueue(tx, …)` inserts within the caller's transaction. `scripts/email-worker.ts` loops: claim batch with `UPDATE … SET status='SENDING' WHERE id IN (SELECT id … WHERE status='QUEUED' AND next_attempt_at <= now() FOR UPDATE SKIP LOCKED LIMIT 20) RETURNING *`, render, send through a `Transport` interface (`ResendTransport` in prod, `ConsoleTransport` when `RESEND_API_KEY` is unset — prints links for local dev and seed), backoff `2^attempts` minutes, max 5. Templates are plain TSX-free functions returning `{ subject, html, text }` per locale (`lib/email/templates/*.ts`) to avoid pulling React Email into the server bundle. Raw tokens are scrubbed from `payload` once terminal.

### D9. pg-boss deferred
Main PRD names pg-boss. For three transactional templates a `SKIP LOCKED` loop is enough and avoids a second schema. **Deviation**, revisit when reports/reminders arrive.

### D10. i18n
`lib/i18n/{bn,en}.ts` flat key→string dictionaries + `t(locale, key, vars)`; locale from `users.locale` (logged in) or `bh_locale` cookie (anonymous), default `bn`. No i18n library — the auth surface is ~150 strings. Server components read locale via `cookies()`; client components get the dictionary slice via props.

### D11. Frontend structure
- `app/(auth)/layout.tsx` — split layout (ink wordmark panel + form panel ≤ 520px) per design system §5 "Login screen". Pages: `login`, `forgot`, `reset/[token]`, `invite/[token]`. Forms are client components using `useActionState` posting to `/api/v1/*` via `lib/api/client.ts`.
- `app/(app)/layout.tsx` — app shell (252px sidebar desktop, bottom nav mobile), loads session server-side via `getAuth()`; nav items filtered by `can()`. Pages: `page.tsx` (A5 shell), `admin/users/page.tsx` (A6, guarded by `user.list`), `me/page.tsx` (A7).
- Shared primitives in `components/ui/` (Button, Input, Field with label + `aria-describedby`, ErrorStrip with focus management, Drawer, Dialog, Tag, Table) built only from design-system tokens added to `app/globals.css` `@theme`.
- `app/layout.tsx`: `metadata.robots = { index: false, follow: false }`, title "BariHisab", `lang` from locale.
- Security headers (CSP, HSTS, X-Frame-Options DENY, Referrer-Policy) in `next.config.ts` `headers()`.

### D12. Testing strategy
- **Vitest** workspace with two projects: `unit` (node env: permissions, tokens, password policy, safe-redirect, csrf, i18n, templates) and `integration` (node env, real Postgres `DATABASE_URL_TEST`, migrations applied once in globalSetup, each test file truncates auth tables except `audit_logs`, which is recreated by dropping the schema). Route handlers are invoked directly (`await POST(new Request(...))`) — no HTTP server needed.
- **React Testing Library + jsdom** project `ui` for form components (disabled submit, live checks, error strip focus, field error mapping, permission-hidden nav).
- **Playwright** E2E (`e2e/`) for: seed → accept invite → login; lockout; forgot/reset; admin creates user → invite link from ConsoleTransport → accept; owner 403; logout-all across two contexts; 360px viewport screenshots in bn/en.
- Clock control: services take `now()` from `lib/clock.ts`; tests use `vi.setSystemTime` for 72 h / 1 h / 15 min / 12 h boundaries.
- Coverage gate: 100% on `lib/permissions.ts` and `lib/auth/tokens.ts`, ≥ 90% on `lib/auth/**` overall.

### D13. Error envelope
PRD §7 shows `{ error: { code, message } }`; the project's established envelope is `{ success: false, error: { code, message, details } }` (`lib/api/response.ts`). We keep the project envelope — a superset of the PRD shape. **Deviation (shape only).** New `lib/api/errors.ts` holds the error-code catalogue with HTTP status and bn/en messages.

### D14. Form inputs: calendar picker and placeholder hints
- **Date picker.** The native `<input type="date">` looks different in every browser, ignores the design system (rounded, blue, OS-styled) and can't be put in Bangla. Date fields use one shared `DateField` (`components/forms/fields.tsx`) built from shadcn `Popover` + `Calendar` (`react-day-picker`), themed to tokens: zero radius, ink selection, surface "today", 44px day cells, Heroicons chevrons. Month and year dropdowns make far-past dates (birthdays) quick to reach. In `bn` it uses the `react-day-picker` `bn` locale and Bangla digits (`numerals="beng"`).
- **Value format.** Dates stay ISO `YYYY-MM-DD` strings end to end. `parseIsoDate`/`toIsoDate` convert via local date parts, never `toISOString()`, which would move the day back in UTC+6.
- **"Today" is Asia/Dhaka.** `lib/clock.ts` `todayIsoInDhaka()` is the single source. The server birthday rule compares ISO strings against it, and the picker disables days after it, so client and server agree at every hour.
- **Placeholders.** Every free-text input gets a bilingual `ph.*` hint (example or format). Labels stay the accessible name; placeholders only help.
- **Trade-off:** adds `react-day-picker` (locales are tree-shaken). The popover stays non-modal: a browser test showed it scrolls fine inside the modal drawer, so modal focus trapping and `aria-hidden` side effects aren't needed.

## Risks / Trade-offs

- [Access token stays valid up to 15 min after revocation] → strict revocation check on every sensitive endpoint, `token_version` bump on role/status/password changes, short TTL; page navigations of a revoked user fail at next refresh.
- [Custom token layer = more security-critical code we own] → small surface (`tokens.ts` ≈ sign/verify/rotate/revoke), 100% coverage gate, independent security review task before merge.
- [better-auth upgrades may change internal adapter / `$context` API] → wrap all better-auth usage in `lib/auth/credentials.ts` (one file to fix), pin minor version.
- [Refresh race between two tabs triggers false reuse detection] → 30 s grace window: a token rotated < 30 s ago mints a sibling session in the same family instead of revoking.
- [Proxy redirect-to-refresh loop if refresh keeps failing] → refresh endpoint always clears cookies on failure and redirects to `/login`, never back to the page.
- [Resend outage] → outbox retries + FAILED state; ConsoleTransport fallback only in non-production.
- [Argon2 native binary on deployment platform] → `@node-rs/argon2` ships prebuilt binaries for linux-x64/arm64/darwin; fallback to bcrypt cost 12 documented if a platform lacks one.
- [Audit table REVOKE ineffective when app connects as owner in dev] → trigger-based guard in addition to REVOKE.
- [Next 16 `cacheComponents` caching personalised data] → every auth-dependent server component/handler calls `await connection()` or reads `cookies()`; integration test asserts no cross-user leakage on `/api/v1/me`.

### Security review (task 17.5): fixed and still open

Fixed: open redirect via dot-segment normalisation in `safeNext`; logout and single-session revoke now kill the whole refresh family, and at most one grace sibling is allowed per rotated token; `GET /auth/refresh` refuses cross-site navigations (`Sec-Fetch-Site`); an email change voids open invite/reset tokens and re-invites INVITED users; route guards are strict by default; rightmost `X-Forwarded-For` hop; 64 KB body cap; bounded audit cursor; Argon2-equal timing on the locked path; `rate_limits` pruned by the worker loop.

Open, needs a product decision or a follow-up change:
- [Lockout as DoS and enumeration] The PRD asks for `423 ACCOUNT_LOCKED` and the "N attempts left" hint, which reveal that an account exists, and anyone can keep any account locked. Options: per-(account, IP) lock, escalating delay, or Super Admin unlock (PRD §9 Q4).
- [CSP `'unsafe-inline'` for scripts] Move to a nonce-based CSP set in `proxy.ts`. This makes every page dynamic, so measure the cost first.
- [Argon2 CPU cost without a trusted proxy] The per-IP limit is skipped when `TRUST_PROXY=false`. Add a global login throughput cap, or require `TRUST_PROXY=true` in production.
- Low: forgot-password timing differs for real and unknown emails; anyone can use up an account's 3-per-hour reset quota; cookies have no `__Host-` prefix.

### Code review fixes (2026-11-09)

- Concurrent refreshes no longer log the user out (CAS loser → grace path; up to 3 siblings).
- `user_roles.property_id` FK is `ON DELETE RESTRICT` (migration `user_roles_property_restrict`), because a NULL property means "global".
- A password change also voids open RESET links.
- The integration and E2E suites take a session-level advisory lock on the shared `_test` DB and refuse non-local hosts.
- `instrumentation.ts` validates the environment at server start.
- Still open: the `audit_logs` REVOKE doesn't bind the table owner or superusers; only the trigger does. In production, connect as a separate least-privilege role.

## Implementation notes

- UI language is stored in a readable `bh_locale` cookie (set by the toggle and on login/accept from `users.locale`); the toggle also PATCHes `/me` when logged in. Pages stay bilingual without a per-request DB read.
- 422 password-policy responses carry `details.reason` (`TOO_SHORT`, `MATCHES_IDENTITY`, …) so the UI can show the message in the user's language.
- E2E runs `next build && next start` against the `_test` database and reads invite/reset links from `email_outbox` (no inbox in tests); the worker is not involved.
- Prisma can't express the citext CHECK, the COALESCE unique index, partial indexes or the audit triggers; they live as hand-written SQL in the `auth_foundation` migration. If `migrate dev` proposes dropping them, keep them.

## Migration Plan

1. `pnpm install`; add new deps; `.env.example` gains the new vars.
2. `pnpm db:migrate` creates the auth migration (citext extension, tables, indexes, trigger, REVOKE).
3. `pnpm db:seed` → prints first Super Admin invite URL.
4. Run `pnpm email:worker` alongside the app (pm2/cron in prod).
5. Rollback: the migration only adds objects; `prisma migrate resolve --rolled-back` + a down SQL dropping the new tables restores the previous state. No existing data is touched.

## Open Questions

- Resend sender domain and `EMAIL_FROM` address — needed for staging acceptance, not for implementation (ConsoleTransport covers dev and tests).
- Production app DB role name for the `REVOKE` statement — migration reads it from a `current_user`-independent approach (`REVOKE … FROM PUBLIC` + trigger); confirm role name before production deploy.
