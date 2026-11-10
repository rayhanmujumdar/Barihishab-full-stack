## 1. Error classification (transport)

- [x] 1.1 Write failing unit tests `lib/email/errors.test.ts` for the D2 table: `validation_error` + "domain is not verified" → `SENDER_NOT_VERIFIED` permanent; sandbox "only send testing emails to your own email address" → `SENDER_NOT_VERIFIED`; `invalid_from_address` → `SENDER_NOT_VERIFIED`; recipient `invalid_parameter` → `INVALID_ADDRESS`; `invalid_api_key` (401/403) → `PROVIDER_REJECTED` permanent; 429 / `rate_limit_exceeded` / `daily_quota_exceeded` / 500 / no status (network) → transient
- [x] 1.2 Implement `lib/email/errors.ts`: `EmailSendError { code, permanent, providerName, statusCode }`, `classifyResendError(error)`, and `failureCode(lastError, attempts)` prefix parser with fixed allowlist (`SENDER_NOT_VERIFIED`, `INVALID_ADDRESS`, `PROVIDER_REJECTED`, `RECIPIENT_INACTIVE`, `RETRIES_EXHAUSTED`; unknown prefix + attempts ≥ 5 → `RETRIES_EXHAUSTED`, else `null`)
- [x] 1.3 Make `ResendTransport.send` throw `EmailSendError` (uses `classifyResendError`); wrap thrown network errors as transient; unit-test with a stubbed Resend client

## 2. Worker: permanent failures and shared loop

- [x] 2.1 Extend `tests/integration/email/worker.test.ts` (red): permanent error → `FAILED`, `attempts = 1`, `last_error` starts `SENDER_NOT_VERIFIED:`, token scrubbed, no retry; 429 → `QUEUED`, `attempts = 1`, later `next_attempt_at`; 5 transient failures → `FAILED` with `RETRIES_EXHAUSTED:` prefix; existing success/inactive/concurrency tests still pass
- [x] 2.2 Update `processBatch` in `lib/email/worker.ts` to branch on `EmailSendError.permanent` and write `<CODE>: <masked message>` (≤ 500 chars)
- [x] 2.3 Write failing test for `lib/email/loop.ts`: `runWorkerLoop({ transport, once: true })` runs one batch + housekeeping; `startDevEmailWorker()` called twice starts one loop (globalThis guard); abort signal stops the loop
- [x] 2.4 Extract the loop (batch + rate-limit prune + hourly sweep/reminders) from `scripts/email-worker.ts` into `lib/email/loop.ts`; script becomes a thin wrapper; `pnpm email:worker --once` still works

- [x] 2.5 Dev worker resolves its transport per batch (factory) so `.env` edits apply without restart; standalone worker logs its sender domain and warns in development that `pnpm dev` already runs a worker (design D8)

## 3. Config: sender rule and dev worker

- [x] 3.1 Write failing unit tests for `senderProblem(from, hasKey)`: `someone@gmail.com`, `BariHisab <Someone@GMAIL.com>`, `x@outlook.com` flagged when key set; `BariHisab <no-reply@barihisab.com>` and `onboarding@resend.dev` pass; nothing flagged when key empty
- [x] 3.2 Implement `senderProblem` + free-mail denylist in `lib/env.ts`; add `EMAIL_WORKER` (`on|off`, default `on`) to the schema; `env()` throws on a sender problem when `NODE_ENV=production`
- [x] 3.3 Read `node_modules/next/dist/docs` instrumentation guide (Next 16) and confirm `register()` semantics in dev (runs per server start, Node runtime check)
- [x] 3.4 Update `instrumentation.ts`: in development log one `logWarn` for a sender problem; start `startDevEmailWorker()` when `NODE_ENV=development` and `EMAIL_WORKER !== "off"`; never in production/test/build
- [x] 3.5 Make `scripts/email-worker.ts` run the same sender check (fails in production)
- [x] 3.6 Update `.env.example`: Resend sandbox sender `BariHisab <onboarding@resend.dev>` delivers only to the Resend account's own address; production needs a verified domain (SPF/DKIM/DMARC); `EMAIL_WORKER=off` opt-out; dev worker runs in-process

## 4. Read model

- [x] 4.1 Write failing integration tests `tests/integration/email/status.test.ts` for `outboxStatus(now)`: empty → zeros/nulls; row with `next_attempt_at` 15 min ago → `stalled = true`; row on backoff 2 min in future → not stalled; `FAILED SENDER_NOT_VERIFIED` created yesterday → `failedLast7Days = 1` with `lastFailure` code; `RECIPIENT_INACTIVE` and 8-day-old failures excluded; result has no email/payload fields
- [x] 4.2 Implement `lib/email/status.ts` `outboxStatus` (single `$transaction` of aggregates)
- [x] 4.3 Write failing integration test for `latestInviteStates(userIds)`: older `SENT` + newer `FAILED` → `FAILED`/`SENDER_NOT_VERIFIED`; `SENDING` → `QUEUED`; user without rows absent; one query for many ids
- [x] 4.4 Implement `latestInviteStates` with `DISTINCT ON (to_user_id)`

## 5. API

- [x] 5.1 Extend `tests/integration/api/users-create-list.test.ts` (red): INVITED items carry `inviteEmail { status, queuedAt, sentAt, failureCode }`; ACTIVE items `null`; no `lastError`/payload text in the response
- [x] 5.2 Wire `latestInviteStates` into `listUsers` (INVITED ids on the page only) and the list DTO; add `inviteEmail` to `app/api/v1/users/schema.ts`
- [x] 5.3 Write failing integration tests `tests/integration/api/email-outbox-status.test.ts`: Super Admin 200 with the shape; owner 403 `FORBIDDEN`; anonymous 401; `Cache-Control: no-store`
- [x] 5.4 Implement `app/api/v1/email/outbox/status/{route.ts,schema.ts}` (`await connection()`, `can(user,'user.list')`, ok/fail envelope)
- [x] 5.5 Register the new endpoint and the `inviteEmail` field in `app/api/v1/openapi.ts`; extend `tests/integration/api/openapi.test.ts`; verify `/api/v1/openapi.json` lists `GET /api/v1/email/outbox/status`

## 6. UI (barihisab-design-system + shadcn)

- [x] 6.1 Add i18n keys to `lib/i18n/en.ts` and `lib/i18n/bn.ts`: invite states (queued / sent at {time} / not sent — {reason}), one reason per failure code, banner texts (stalled; N failed + last reason)
- [x] 6.2 Write failing tests in `components/users/users.test.tsx`: FAILED row shows "Invite not sent — sender address not verified" with text (not color only); SENT row shows Asia/Dhaka time; banner shows stalled text, failed-count text, or nothing; stalled wins over failed; resend success invalidates users list query
- [x] 6.3 Implement invite-state line on INVITED rows (desktop table + mobile card) in `components/users/UsersManager.tsx`
- [x] 6.4 Implement the outbox warning banner (`useQuery(["email","outbox-status"])`, 60 s stale, refetch on focus) at the top of the Users screen, design tokens only, zero radius
- [x] 6.5 Visual check at 360 px and desktop in Bangla and English via playwright-cli; screenshots to `.context/`

## 7. Test-send command

- [x] 7.1 Write failing unit tests for `scripts/email-test.ts` arg parsing/exit codes: no arg → usage + exit 2; bad email → exit 2; stub transport success → prints id, exit 0; `EmailSendError SENDER_NOT_VERIFIED` → prints error + fix hint, exit 1; API key masked in output
- [x] 7.2 Implement `scripts/email-test.ts` (`--from` override, no DB access) and add `"email:test": "tsx scripts/email-test.ts"` to `package.json`

## 9. Code review fixes

- [x] 9.1 H1: `EMAIL_WORKER=auto|on|off` (default auto: dev worker only with a provider key); single development sender per database via advisory lock (`lib/email/leader.ts`) gating each batch, also for `pnpm email:worker` in development — tests: `lib/email/boot.test.ts`, `tests/integration/email/leader.test.ts`, loop gate test
- [x] 9.2 M1: standalone worker validates only email settings (`lib/email/config.ts` `emailEnv`) — test: `lib/email/config.test.ts`
- [x] 9.3 M2: unit tests for `warnSenderProblem` and `bootEmail` (injected start/gate)
- [x] 9.4 M3: `instrumentation.ts` loads email worker modules only in development
- [x] 9.5 L1/L2: `MAX_ATTEMPTS` and `FAILURE_CODES` (as const) live in `lib/email/errors.ts`; schemas use `z.enum(FAILURE_CODES)` without casts
- [x] 9.6 L3/L4: `replaceUser` reads the cache before updating, clears a stale invite state when a user re-enters or leaves INVITED and refetches — UI test for reactivation

## 8. Verification

- [x] 8.1 Run `pnpm typecheck`, `pnpm lint`, `pnpm test` (unit + integration + ui) — all green
- [x] 8.2 Run e2e (`pnpm test:e2e`) and confirm invite/reset token flows still pass (`next start` never starts the dev worker)
- [x] 8.3 Manual: with only `pnpm dev` running and sandbox sender, resend an invite to the Resend account's own address → row `SENT` within 10 s and email arrives; with a gmail `EMAIL_FROM` → dev logs one warning, row `FAILED SENDER_NOT_VERIFIED` on first attempt, Users row + banner show it
- [x] 8.4 Run `pnpm email:test <account address>` with sandbox sender (exit 0) and with gmail sender (exit 1 + hint)
- [x] 8.5 Update `openspec/specs` via archive after review; record in proposal Impact any deviation found during implementation
