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
A worker SHALL pick `QUEUED` rows, render the template in the recipient's locale (`bn` or `en`), send through the configured provider (Resend), and on success set `status = SENT`, `sent_at` and `provider_message_id`. On failure it MUST increment `attempts`, store a masked `last_error`, retry with exponential backoff up to 5 attempts, then set `status = FAILED`. Rows whose recipient is INACTIVE MUST be skipped and marked `FAILED` with `last_error = RECIPIENT_INACTIVE` (INVITED recipients are still sent `INVITE` emails). Concurrent workers MUST NOT send the same row twice.

#### Scenario: Successful send
- **WHEN** the worker processes a queued `INVITE` row for a `bn` user
- **THEN** a Bangla invite email is sent and the row is `SENT` with a provider message id

#### Scenario: Retries exhausted
- **WHEN** sending fails 5 times
- **THEN** the row is `FAILED` with `attempts = 5`

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
