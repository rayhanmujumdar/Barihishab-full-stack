## Why

A Super Admin resent an invite and no email ever arrived. Diagnosis on 2026-11-10 found three stacked faults, none of them visible in the app:

1. **The outbox worker was not running.** All 9 `email_outbox` rows (5 `INVITE`, 4 `REQUEST_UPDATE`) sat at `QUEUED` with `attempts = 0`, some since 2026-11-08. `pnpm dev` starts only `next dev`; the worker (`pnpm email:worker`) is a separate process nobody remembered to start, and nothing warns when the queue stalls.
2. **The sender address can never be accepted.** `EMAIL_FROM` was a personal `@gmail.com` address. A live send through `ResendTransport` failed with `validation_error The gmail.com domain is not verified`. Even with the worker running, every row would retry 5 times over ~30 minutes and then go `FAILED` silently — a permanent configuration error treated as a transient one. The same live test from `onboarding@resend.dev` succeeded (provider id `01a1c695-9729-7088-b7f0-e4ef64bb6cf1`), proving the API key and Resend account work.
3. **The invited address differs from the admin's mailbox.** The invited user's stored address differed by one letter from the admin's real mailbox. This is data, not a bug — the existing "Edit user" flow already re-sends the invite when an INVITED user's email changes — but the admin had no way to see where or whether the email went.

The PRD already demands visibility: "On failure, up to 5 retries with exponential backoff, then FAILED + a warning on the Admin dashboard" (Main PRD §11 outbox pattern). That warning was never built.

## What Changes

- **Worker runs with the dev server.** In development, the Next server starts the outbox worker loop in-process (via `instrumentation.ts`), so `pnpm dev` alone delivers email. Opt-out with `EMAIL_WORKER=off`. Production keeps the separate `pnpm email:worker` process (PRD architecture: one app + one background worker). `next start` (used by e2e) never starts it.
- **Sender misconfiguration fails fast.** When `RESEND_API_KEY` is set, `EMAIL_FROM` whose domain is a free mailbox provider (gmail.com, yahoo.com, outlook.com, hotmail.com, live.com, icloud.com, proton.me, …) is rejected: production refuses to boot; development logs one loud, actionable warning naming `onboarding@resend.dev` (sandbox) or a verified domain as the fix.
- **Permanent provider errors stop retrying.** Provider rejections that cannot succeed on retry (Resend `validation_error`, `invalid_from_address`, 4xx other than 429) mark the row `FAILED` on the first attempt with a stable `last_error` code; transient errors (network, 5xx, 429) keep the existing 5-attempt backoff.
- **Admins can see delivery.** The users list returns, for each INVITED user, the delivery state of their latest invite email (`QUEUED` / `SENT` / `FAILED` + reason code + sent time). The Users screen shows it on the row ("Invite sent 12:04", "Invite not sent — sender not verified").
- **Outbox warning for Super Admins.** `/admin/users` shows a warning banner when any email `FAILED` in the last 7 days, or when the oldest `QUEUED` row is older than 10 minutes ("Emails are not being sent — the email worker may be stopped"). Backed by a new `GET /api/v1/email/outbox/status` endpoint (Super Admin only), registered in Swagger.
- **Test-send command.** `pnpm email:test <to> [--from <sender>]` sends one plain test message straight through the configured transport (bypassing the outbox) and prints the provider id or the exact provider error. For operators verifying a new key/domain.
- `.env.example` documents the Resend sandbox rule (sandbox sender only delivers to the Resend account's own address) and that the worker runs in-process in dev.

## Capabilities

### New Capabilities
- `email-ops`: operator-facing email health — outbox status endpoint, admin warning banner, per-invite delivery state, and the `email:test` command.

### Modified Capabilities
- `email-outbox`: "Worker delivers with retries" changes — permanent provider errors fail immediately instead of retrying; new requirements for sender-address validation at boot and the in-process dev worker.
- `user-management`: "List and search users" changes — list items for INVITED users carry the latest invite delivery state.

## Impact

- **Code:** `lib/email/transport.ts` (typed permanent vs transient errors), `lib/email/worker.ts` (fail-fast path, shared loop extracted from `scripts/email-worker.ts`), `instrumentation.ts` (dev worker start), `lib/env.ts` (`EMAIL_FROM` rule, `EMAIL_WORKER`), `lib/users/admin-service.ts` (`listUsers` joins latest invite row), new `lib/email/status.ts`, new `app/api/v1/email/outbox/status/{route,schema}.ts`, `app/api/v1/openapi.ts`, `components/users/UsersManager.tsx`, `lib/i18n/{en,bn}.ts`, new `scripts/email-test.ts`, `package.json` (`email:test`), `.env.example`.
- **API:** new `GET /api/v1/email/outbox/status`; additive `inviteEmail` field on `GET /api/v1/users` items. No breaking changes.
- **Data:** no migration. Reads existing `email_outbox` columns; an index on `(status, next_attempt_at)` already serves the worker claim and the stale-queue query.
- **Ops / config (not code):** the local `.env` must change `EMAIL_FROM` to `BariHisab <onboarding@resend.dev>` for dev, and production needs a verified domain on Resend with SPF/DKIM/DMARC (PRD §11). The Resend sandbox only delivers to the account owner's address, so invites to other addresses need the verified domain.
- **Tests:** e2e runs `next start` with `RESEND_API_KEY=""`, so the dev worker never runs there and `e2e/db.ts` can keep reading tokens from `QUEUED` rows.

## PRD coverage

- Main PRD §11 Notifications — outbox pattern, "FAILED + a warning on the Admin dashboard", provider behind an interface, SPF/DKIM/DMARC.
- Main PRD USR-04 / Auth PRD INV-04 — resend invite (delivery now observable).
- Auth PRD EML-01 — API never sends inline (unchanged; the test command is an operator CLI, not an API path).

## Out of scope

- Verifying a domain on Resend, DNS records, or switching provider (ops task, documented only).
- Correcting the "Rayhan Owner" email typo (admin uses the existing Edit user flow).
- A Home dashboard tile for email failures — `add-home-dashboard` is in flight and owns the home layout; the warning lives on `/admin/users` for now (see design D5).
- Manual "retry failed email" action, email preferences, React Email migration.
- Exposing outbox numbers on the public `/api/v1/health` endpoint.
