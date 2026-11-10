## Context

See proposal.md — Why for the three faults found on 2026-11-10. Current shape:

- `lib/email/outbox.ts` — `enqueueEmail()` inserts rows inside the caller's transaction (EML-01). Unchanged.
- `lib/email/worker.ts` — `processBatch(transport)` claims rows with `FOR UPDATE SKIP LOCKED` + a 10-minute lease, sends, and on any throw retries with `2^attempts` minutes backoff until 5 attempts.
- `lib/email/transport.ts` — `ResendTransport` throws `Error("Resend: <name> <message>")`; the error's `name` (`RESEND_ERROR_CODE_KEY`, resend@6.37) and `statusCode` are flattened into a string, so the worker cannot tell permanent from transient. `transportFromEnv()` picks Resend when `RESEND_API_KEY` is set, else `ConsoleTransport` (dev only).
- `scripts/email-worker.ts` — the loop (5 s poll) plus housekeeping (rate-limit prune; hourly upload sweep and request reminders). Only runs when someone starts `pnpm email:worker`.
- `instrumentation.ts` — `register()` validates env on the Node runtime.
- e2e (`playwright.config.ts`) runs `next start` with `RESEND_API_KEY=""`, and `e2e/db.ts` reads raw invite/reset tokens from the newest **unsent** outbox row. Anything that sends during e2e would scrub those tokens.
- No UI or API exposes outbox state anywhere.

## Goals / Non-Goals

**Goals:**
- A fresh `pnpm dev` delivers invites with no extra command.
- A misconfigured sender is caught at boot, not 30 minutes later in a silent `FAILED` row.
- Permanent provider rejections are classified once and surfaced as stable codes the UI can translate.
- One endpoint drives both the Super Admin banner and per-row invite state, without leaking addresses or provider text.

**Non-Goals:**
- Replacing the hand-rolled worker with pg-boss (PRD mentions it; current worker meets the spec).
- Auto-requeueing rows after the configuration is fixed — the admin presses "Resend invite" (now visibly needed).
- Checking domain verification against the Resend Domains API at boot (needs a full-access key; the free-mail denylist catches the case seen).

## Decisions

### D1. Dev worker runs in-process from `instrumentation.ts`
`register()` (Node runtime only) calls `startDevEmailWorker()` when `process.env.NODE_ENV === "development"` and `EMAIL_WORKER !== "off"`. The loop body is extracted from `scripts/email-worker.ts` into `lib/email/loop.ts` (`runWorkerLoop({ transport, signal, once })`) so the script and the dev hook share one implementation, housekeeping included. A `globalThis.__barihisabEmailWorker` guard prevents a second loop if `register()` re-runs on hot reload. Read `node_modules/next/dist/docs/01-app/**/instrumentation*` before implementing (Next 16 may differ).

- *Alternative: `concurrently "next dev" "pnpm email:worker"` in the `dev` script.* Rejected: Conductor and the e2e/dev conventions pass `--port` to `pnpm dev`; wrapping breaks argument passthrough and adds a dependency.
- *Alternative: run in-process in production too.* Rejected: PRD architecture is app + one worker; serverless/multi-instance hosting would multiply loops and tie email to request-serving processes. SKIP LOCKED makes duplicates safe but not desirable.
- Safety: `next start` sets `NODE_ENV=production`, so e2e never runs it; vitest never loads `instrumentation.ts`. Several Conductor workspaces sharing the dev DB each run a loop — safe via SKIP LOCKED + lease, and the existing guarantee "concurrent workers never send the same row" covers it.

### D2. Typed send errors: `EmailSendError { code, permanent, providerName, statusCode }`
`ResendTransport` maps the Resend error object instead of stringifying it:

| Resend signal | `code` | permanent |
|---|---|---|
| `validation_error` / 403 whose message mentions "domain is not verified" or "only send testing emails" | `SENDER_NOT_VERIFIED` | yes |
| `invalid_from_address` | `SENDER_NOT_VERIFIED` | yes |
| `validation_error` / `invalid_parameter` / `missing_required_field` about `to` | `INVALID_ADDRESS` | yes |
| `invalid_api_key`, `restricted_api_key`, `missing_api_key`, `invalid_access`, other 4xx except 429 | `PROVIDER_REJECTED` | yes |
| 429, `rate_limit_exceeded`, `daily_quota_exceeded`, `monthly_quota_exceeded`, 5xx, `application_error`, `internal_server_error`, network/timeout (no status) | `TRANSIENT` | no |

The Resend sandbox rejection ("You can only send testing emails to your own email address") maps to `SENDER_NOT_VERIFIED` because its fix is the same: verify a domain. Message matching is a fallback only; `name`/`statusCode` decide first.

The worker writes `last_error = "<CODE>: <masked message>"` (≤ 500 chars) and, for permanent errors, goes straight to `FAILED` with scrubbed payload. After 5 transient failures it writes `RETRIES_EXHAUSTED: <masked message>`. The list DTO and status endpoint parse only the prefix before `:` against a fixed allowlist, so provider text never leaves the server.

- *Alternative: a new `failure_code` column.* Rejected for now — no migration needed, prefix parsing is a single pure function with tests, and old rows without a prefix map to `null` (or `RETRIES_EXHAUSTED` when `attempts ≥ 5`).
- Trade-off: failing an invalid API key immediately fails every row in that batch. Accepted: retrying for 30 minutes delivers nothing either, and the banner (D4) now says so; admins resend after fixing.

### D3. `EMAIL_FROM` rule lives in `lib/env.ts`
A pure `senderProblem(from, hasKey)` extracts the address from `Name <addr>` / bare form, lowercases the domain, and checks a small denylist of free mailbox domains. `env()` throws on a problem when `NODE_ENV === "production"`; in development `instrumentation.ts` logs one `logWarn("email", …)`. `scripts/email-worker.ts` calls the same check so the standalone worker also refuses to run in production with a bad sender. `EMAIL_WORKER` (`"on" | "off"`, default `"on"`) is added to the env schema.

- *Alternative: hard-fail in development too.* Rejected: it would stop the whole app (login, entries) over an email setting; dev already has an obvious, logged fallback.

### D4. One read model: `lib/email/status.ts`
- `outboxStatus(now)` — four aggregate queries in one `$transaction([...])`: count + min(`created_at`) of `QUEUED|SENDING`; `exists` row with `status IN (QUEUED,SENDING) AND next_attempt_at < now − 10 min` (served by `@@index([status, nextAttemptAt])`); count of `FAILED` with `created_at ≥ now − 7 d` and `last_error NOT LIKE 'RECIPIENT_INACTIVE%'`; latest such row's `created_at`, `template`, code. `email_outbox` has no `updated_at`; `created_at` is a sound proxy because a row is terminal within ~30 min (5 attempts, backoff 2+4+8+16 min) and permanent errors now fail on the first attempt. Avoids a migration.
- `latestInviteStates(userIds)` — one `DISTINCT ON (to_user_id) … WHERE template='INVITE' AND to_user_id = ANY($1) ORDER BY to_user_id, created_at DESC` query; `listUsers` calls it only for the INVITED ids on the page (no N+1).
- `failureCode(lastError, attempts)` — pure prefix parser shared by both.

Stalled uses `next_attempt_at`, not `created_at`, so rows legitimately waiting on backoff are not "stalled", while a dead worker (rows never claimed, or a lease expired 10 min ago with nobody re-claiming) is.

### D5. Banner on `/admin/users`, not the Home dashboard (PRD deviation)
PRD §11 says "a warning on the Admin dashboard". `add-home-dashboard` is mid-implementation and owns `app/[lang]/(app)/page.tsx` and its notices seam; touching it now would conflict. The banner ships on `/admin/users` — where invites are managed and where the failure was noticed — via a `useQuery(["email","outbox-status"])` in `UsersManager` (refetch on window focus, 60 s stale time). Follow-up: once home-dashboard is archived, feed the same endpoint into its notices seam.

### D6. Endpoint path and permission
`app/api/v1/email/outbox/status/{route.ts,schema.ts}`, guarded by `can(user, 'user.list')` — Super Admin only in the RBAC matrix, and the same audience as the Users screen. No new permission key (would need RBAC spec + seed changes for no gain). `await connection()` + `Cache-Control: no-store`. Registered in `app/api/v1/openapi.ts`.

### D7. `scripts/email-test.ts`
Operator CLI (not an API route, so EML-01 still holds): validates `<to>` with `z.email()`, builds a transport via `transportFromEnv()` or `new ResendTransport(key, --from)`, sends one message with timestamp + sender in the body, prints id or `EmailSendError` code/name/message with the API key masked (`lib/log.mask`). Exit codes: 0 ok, 1 send failure, 2 usage. Does not touch the DB.

### D8. Dev worker resolves the transport per batch (found during apply)
On 2026-11-11 a `pnpm email:worker` started at 00:34 kept the old gmail `EMAIL_FROM` after `.env` was fixed at 00:41; it raced the dev server's worker and failed every invite with `SENDER_NOT_VERIFIED`. `runWorkerLoop` now accepts a transport factory and the dev worker passes `transportFromEnv`, so the sender is read every batch (`next dev` reloads `.env` into `process.env`). The standalone worker keeps one snapshot (production semantics) but logs its sender domain, and in development warns that `pnpm dev` already runs a worker.

### D9. One development sender per database (code review H1)
Conductor workspaces share the dev DB but each has its own `.env`. With the worker on by default in every `next dev`, a key-less workspace's console transport could mark real invites `SENT`, and a stale sender could fail them. Two guards: `EMAIL_WORKER=auto` (default) starts the dev worker only when `RESEND_API_KEY` is set (`on` keeps the console-transport behaviour for solo work), and every development worker gates each batch on a session-level `pg_try_advisory_lock` held on a dedicated `pg` connection (`lib/email/leader.ts`). The lock is released when the process exits or its connection drops, so another worker takes over within one poll. Production replicas are not gated: they share work via `SKIP LOCKED` and identical config.

- *Alternative: a lease row in a new table.* Rejected — needs a migration and expiry handling; the advisory lock is released by Postgres itself.
- The standalone worker validates only email settings (`lib/email/config.ts`), so a worker container no longer needs auth secrets (review M1). `instrumentation.ts` imports the worker modules only in development (review M3).

## Risks / Trade-offs

- [Dev worker sends real email from every workspace that has a real key] → `.env.example` keeps `RESEND_API_KEY` empty by default; console transport stays the dev default; `EMAIL_WORKER=off` documented.
- [In-process worker shares the event loop with `next dev`] → batches are small (20), I/O-bound, 5 s apart; negligible next to dev compilation.
- [Hot reload starts a second loop] → `globalThis` guard; test asserts a second `start` call is a no-op.
- [Free-mail denylist is incomplete] → it targets the common mistake; anything else still fails fast at send time via D2 with `SENDER_NOT_VERIFIED`.
- [Message-text matching for sandbox/unverified errors breaks if Resend rewords] → `name`/`statusCode` classify first (403 validation → permanent anyway); text only refines the code; worst case the code is `PROVIDER_REJECTED`, still permanent and visible.
- [Existing stuck rows] → the 9 rows queued today will be sent by the first worker run. Invites older than 72 h carry expired tokens; admins resend those.

## Migration Plan

1. Ship code; no DB migration.
2. Local dev: change `.env` `EMAIL_FROM` to `BariHisab <onboarding@resend.dev>` (sandbox: delivers only to the Resend account's own address) or keep `RESEND_API_KEY` empty for console mode.
3. Production: verify a sending domain in Resend (SPF/DKIM/DMARC per PRD §11), set `EMAIL_FROM` to it, deploy app + `pnpm email:worker`, run `pnpm email:test <admin address>`.
4. Rollback: revert the commit; behavior returns to manual worker + string errors. No data to undo.

## Open Questions

- Should rows already `FAILED` with `SENDER_NOT_VERIFIED` get a bulk "retry all" once the sender is fixed? Deferred — per-user "Resend invite" covers invites; `REQUEST_UPDATE` notifications are informational.
