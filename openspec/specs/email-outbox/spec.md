# email-outbox Specification

## Purpose

Delivers invite, password-reset and password-changed emails reliably and in the recipient's language, without ever sending email inside a request, so a mail-provider outage never breaks login or user creation. (Auth PRD EML-01; Main PRD outbox pattern)

## Requirements

### Requirement: Emails are queued, never sent inline
API handlers MUST NOT call the email provider. They SHALL insert an `email_outbox` row (`to_user_id`, `template`, `payload`, `status = QUEUED`, `dedupe_key`) in the same transaction as the triggering change. A duplicate `dedupe_key` MUST NOT create a second row. (EML-01)

#### Scenario: Provider down during user creation
- **WHEN** the email provider is unreachable and a Super Admin creates a user
- **THEN** the API responds `201` and the outbox row stays `QUEUED`

#### Scenario: Dedupe
- **WHEN** the same event is enqueued twice with the same dedupe key
- **THEN** only one outbox row exists

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

### Requirement: Auth email templates
The system SHALL provide `INVITE` (link to `/invite/:token`, inviter name, 72 h expiry), `RESET` (link to `/reset/:token`, 1 h expiry) and `PASSWORD_CHANGED` (time, "if this wasn't you, reset now") templates in both `bn` and `en`. Raw tokens MUST appear only in the rendered email link and MUST be removed from the outbox payload once the row is `SENT` or `FAILED`.

#### Scenario: English reset email
- **WHEN** a `RESET` row for an `en` user is rendered
- **THEN** the subject and body are English and contain a `/reset/<token>` link mentioning the 1-hour expiry

#### Scenario: Token scrubbed after send
- **WHEN** an `INVITE` row is marked `SENT`
- **THEN** its stored payload no longer contains the raw token

### Requirement: Request email template
The system SHALL provide a `REQUEST_UPDATE` template in `bn` and `en` whose payload holds the event (`SUBMITTED`, `RECORDED`, `EDITED`, `CANCELLED`, `APPROVED`, `SELF_APPROVED`, `REJECTED`, `WITHDRAWN`, `DISBURSED`, `REMINDER`), request number and id, owner name, type, requested and approved amounts in paisa, a short reason (≤ 80 characters), the decision note or reason when the recipient is the requester or a Super Admin, the actor name and, for reminders, the reminder kind (`PENDING_3_DAYS` or `APPROVED_PAST_DUE`). The rendered email MUST link to `/{locale}/requests?request={id}`, format money as ৳ with lakh grouping (Bangla digits in `bn`), and MUST NOT contain any fund account, reference number or payment method. (Requests PRD §10, D16)

#### Scenario: Disbursed email to another owner
- **WHEN** a `DISBURSED` row for an `en` owner who is not the requester is rendered
- **THEN** the email names the requester, type, ৳ amount, short reason and approver, links to the request, and contains no reference number or method

#### Scenario: Bangla approved email
- **WHEN** an `APPROVED` row in `bn` with approved 600000 paisa is rendered
- **THEN** the body is Bangla and shows ৳৬,০০০ with the note

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

### Requirement: Notice email template
The system SHALL provide a `NOTICE` template in `bn` and `en` whose payload holds the event (`PUBLISHED`, `EDITED`, `REMINDER`), notice id, title, body, urgent flag and author name. The subject MUST start with "[Urgent] " (Bangla equivalent in `bn`) for urgent notices; the body MUST render the notice text with only bold, bullets and safe links (all other text escaped) and link to `/{locale}/notices?notice={id}`. (Notices & Complaints PRD §11, Rule 3, G4)

#### Scenario: Urgent subject
- **WHEN** a `PUBLISHED` urgent notice "Water tank cleaning — Sunday 26 Oct" is rendered in `en`
- **THEN** the subject starts with "[Urgent] Water tank cleaning"

#### Scenario: HTML escaped
- **WHEN** the body contains `<img src=x onerror=alert(1)>`
- **THEN** the email shows it as text

### Requirement: Complaint email template
The system SHALL provide a `COMPLAINT_UPDATE` template in `bn` and `en` whose payload holds the event (`NEW`, `NEW_PRIVATE`, `IN_REVIEW`, `RESOLVED`, `REJECTED`, `WITHDRAWN`, `REOPENED`), complaint id, title, complainant name, actor name, the explanation for `RESOLVED`/`REJECTED`, and whether to include a link. It MUST link to `/{locale}/complaints/{id}` only when the link flag is set, and MUST NOT contain the complaint body, any phone number, email address or bank detail. (Notices & Complaints PRD §11; main PRD §11 privacy)

#### Scenario: New complaint email has no body
- **WHEN** a `NEW` email for "September electricity bill looks high" is rendered
- **THEN** it names Farzana and the title, links to the complaint, and does not contain the description

#### Scenario: Resolution without link
- **WHEN** a `RESOLVED` email for a member who cannot see the complaint is rendered
- **THEN** it shows the title and explanation and contains no link to the complaint
