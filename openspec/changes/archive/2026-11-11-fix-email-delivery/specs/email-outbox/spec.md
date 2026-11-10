## MODIFIED Requirements

### Requirement: Worker delivers with retries
A worker SHALL pick `QUEUED` rows, render the template in the recipient's locale (`bn` or `en`), send through the configured provider (Resend), and on success set `status = SENT`, `sent_at` and `provider_message_id`. On a **transient** failure (network error, timeout, provider 5xx, provider rate limit 429) it MUST increment `attempts`, store a masked `last_error`, retry with exponential backoff up to 5 attempts, then set `status = FAILED`. On a **permanent** failure (the provider rejects the message itself — unverified sender domain, invalid sender or recipient address, any other 4xx except 429) it MUST set `status = FAILED` on that first attempt with `attempts` incremented and `last_error` starting with a stable code (`SENDER_NOT_VERIFIED`, `INVALID_ADDRESS` or `PROVIDER_REJECTED`) followed by the masked provider message. Rows whose recipient is INACTIVE MUST be skipped and marked `FAILED` with `last_error = RECIPIENT_INACTIVE` (INVITED recipients are still sent `INVITE` emails). Concurrent workers MUST NOT send the same row twice. Raw tokens MUST be scrubbed from the payload whenever a row becomes `FAILED`, whichever path led there.

#### Scenario: Successful send
- **WHEN** the worker processes a queued `INVITE` row for a `bn` user
- **THEN** a Bangla invite email is sent and the row is `SENT` with a provider message id

#### Scenario: Retries exhausted
- **WHEN** sending fails transiently 5 times
- **THEN** the row is `FAILED` with `attempts = 5`

#### Scenario: Unverified sender fails immediately
- **WHEN** the provider answers the first attempt with "domain is not verified"
- **THEN** the row is `FAILED` with `attempts = 1`, `last_error` starts with `SENDER_NOT_VERIFIED`, no retry is scheduled, and the payload no longer contains the raw token

#### Scenario: Rate limit is retried
- **WHEN** the provider answers with a 429 rate-limit error
- **THEN** the row returns to `QUEUED` with `attempts = 1` and a later `next_attempt_at`

#### Scenario: Inactive recipient
- **WHEN** a queued row targets an INACTIVE user
- **THEN** nothing is sent and the row is `FAILED` with `last_error = RECIPIENT_INACTIVE`

## ADDED Requirements

### Requirement: Sender address must be sendable
When a provider API key (`RESEND_API_KEY`) is configured, the sender address `EMAIL_FROM` MUST NOT use a free public mailbox domain (at least `gmail.com`, `googlemail.com`, `yahoo.com`, `outlook.com`, `hotmail.com`, `live.com`, `icloud.com`, `proton.me`, `protonmail.com`), because providers only send from domains the account has verified. In production the server and the worker MUST refuse to start with an error naming `EMAIL_FROM` and the required fix. In development they SHALL start but log one warning that names the bad sender and suggests `BariHisab <onboarding@resend.dev>` for local testing. Matching MUST be case-insensitive and MUST read the address inside a `Name <address>` form. When no API key is configured, `EMAIL_FROM` is not checked.

#### Scenario: Gmail sender in production
- **WHEN** production starts with `RESEND_API_KEY` set and `EMAIL_FROM="someone@gmail.com"`
- **THEN** startup fails with a message naming `EMAIL_FROM` and the verified-domain requirement

#### Scenario: Gmail sender in development
- **WHEN** development starts with `RESEND_API_KEY` set and `EMAIL_FROM="BariHisab <Someone@GMAIL.com>"`
- **THEN** the server starts and logs exactly one warning suggesting `onboarding@resend.dev`

#### Scenario: Verified domain sender
- **WHEN** `EMAIL_FROM="BariHisab <no-reply@barihisab.com>"`
- **THEN** startup proceeds without a warning

#### Scenario: Console transport
- **WHEN** `RESEND_API_KEY` is empty in development and `EMAIL_FROM` is a gmail address
- **THEN** no sender warning is logged and emails print to the console

### Requirement: Development server delivers email without a second process
In development (`next dev`), the app server SHALL run the outbox worker loop in the same process, polling every 5 seconds, so queued emails are delivered without starting `pnpm email:worker`. `EMAIL_WORKER` SHALL accept `auto` (default: run only when a provider API key is configured), `on` (run even with the console transport) and `off` (never). Across all development workers sharing one database (dev servers in several workspaces and any `pnpm email:worker` started in development), at most one MUST send at a time; the others MUST stand by, MUST log that another process is sending, and MUST take over when the sending process stops. The in-process worker MUST NOT run in production builds (`next start`), in tests, or during `next build`; production continues to use the standalone `pnpm email:worker` process. It MUST start at most once per server process (no duplicate loops on hot reload), MUST read the provider configuration (`EMAIL_FROM`, `RESEND_API_KEY`) afresh for every batch, and MUST be safe to run alongside a standalone worker on the same database.

#### Scenario: Invite delivered with only the dev server running
- **WHEN** only `pnpm dev` is running and a Super Admin resends an invite
- **THEN** within 10 seconds the new `INVITE` row leaves `QUEUED`

#### Scenario: Opt-out
- **WHEN** `pnpm dev` runs with `EMAIL_WORKER=off`
- **THEN** queued rows stay `QUEUED`

#### Scenario: Key-less workspace does not consume real emails
- **WHEN** `pnpm dev` runs with `EMAIL_WORKER=auto` and no `RESEND_API_KEY`, sharing the database with a workspace that has a key
- **THEN** it starts no worker and the other workspace sends the queued rows

#### Scenario: One sender per database
- **WHEN** two dev servers run against the same database with the worker enabled
- **THEN** only one sends; the other logs that another process is sending and takes over once the first stops

#### Scenario: Sender change applies without a restart
- **WHEN** `EMAIL_FROM` is edited in `.env` while `pnpm dev` is running
- **THEN** the next batch the in-process worker sends uses the new sender

#### Scenario: Standalone worker in development
- **WHEN** `pnpm email:worker` is started in development while the in-process worker is enabled
- **THEN** it logs that `pnpm dev` already runs a worker and names the sender domain it loaded

#### Scenario: Production server does not send
- **WHEN** the app runs under `next start`
- **THEN** the app process sends no email and queued rows wait for the standalone worker
