# email-ops Specification

## Purpose

Lets operators see whether the app is actually delivering email — outbox health for Super Admins and a direct test-send command — so stalled or misconfigured delivery is noticed instead of failing silently.

## Requirements

### Requirement: Outbox status endpoint
`GET /api/v1/email/outbox/status` (permission `user.list`, Super Admin) SHALL respond `200 { queued, oldestQueuedAt, stalled, failedLast7Days, lastFailure }` where `queued` counts `QUEUED` and `SENDING` rows, `oldestQueuedAt` is the creation time of the oldest such row or `null`, `stalled` is `true` when a row has been waiting with `next_attempt_at` more than 10 minutes in the past, `failedLast7Days` counts `FAILED` rows created in the last 7 days excluding `RECIPIENT_INACTIVE` (rows reach a terminal state within about 30 minutes of creation), and `lastFailure` is `{ at, template, failureCode }` for the most recently created such row (`at` = its creation time) or `null`. The response MUST NOT include recipient addresses, payloads, tokens or raw provider messages. It MUST be uncached and registered in Swagger. Callers without the permission get `403 FORBIDDEN`; anonymous callers get `401`.

#### Scenario: Stalled queue detected
- **WHEN** a `QUEUED` row has `next_attempt_at` 15 minutes ago
- **THEN** the response has `stalled = true` and `queued ≥ 1`

#### Scenario: Recent failure summarized
- **WHEN** an `INVITE` row created yesterday is `FAILED` with `SENDER_NOT_VERIFIED`
- **THEN** `failedLast7Days = 1` and `lastFailure.failureCode = "SENDER_NOT_VERIFIED"` with no email address in the body

#### Scenario: Owner cannot read status
- **WHEN** a user without `user.list` calls the endpoint
- **THEN** the API responds `403 FORBIDDEN`

### Requirement: Email warning banner for Super Admins
The `/admin/users` screen SHALL show a warning banner to Super Admins when the outbox status is `stalled` ("Emails are not being sent. The email worker may be stopped.") or when `failedLast7Days > 0` ("N emails failed to send in the last 7 days. Last reason: …"). The stalled message takes precedence. The banner MUST be absent when neither holds, MUST be in Bangla or English per locale, and MUST follow the design system (no new colors, zero radius).

#### Scenario: Worker stopped
- **WHEN** a Super Admin opens Users while the outbox is stalled
- **THEN** a banner says emails are not being sent and the worker may be stopped

#### Scenario: Healthy outbox
- **WHEN** nothing is stalled and nothing failed in 7 days
- **THEN** no banner is shown

### Requirement: Test-send command
`pnpm email:test <to> [--from <sender>]` SHALL send one plain-text-plus-HTML test message to `<to>` directly through the configured transport, without writing to `email_outbox`, using `EMAIL_FROM` unless `--from` is given. On success it MUST print the provider message id and exit `0`; on failure it MUST print the provider's error (name and message, API key masked) plus, for an unverified sender, the fix hint, and exit non-zero. With no API key configured it MUST print the message to the console (development) and say that no real email was sent. A missing or malformed `<to>` MUST exit non-zero with usage help.

#### Scenario: Provider rejects gmail sender
- **WHEN** `pnpm email:test me@example.com` runs with `EMAIL_FROM` on gmail.com and a real API key
- **THEN** it prints the "domain is not verified" error with the fix hint and exits non-zero

#### Scenario: Sandbox sender succeeds
- **WHEN** `pnpm email:test owner@example.com --from "BariHisab <onboarding@resend.dev>"` runs and the provider accepts
- **THEN** it prints the provider message id and exits `0`

#### Scenario: No recipient
- **WHEN** `pnpm email:test` runs without an argument
- **THEN** it prints usage and exits non-zero
