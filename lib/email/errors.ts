// Provider failures split into permanent (the message itself is rejected, so
// retrying cannot help) and transient (outage, rate limit). The worker stores
// `<CODE>: <masked message>` in last_error; only the code ever leaves the server.

/** Transient failures are retried up to this many attempts, then the row is FAILED. */
export const MAX_ATTEMPTS = 5;

export type SendFailureCode = "SENDER_NOT_VERIFIED" | "INVALID_ADDRESS" | "PROVIDER_REJECTED" | "TRANSIENT";

/** Codes the API may expose for a FAILED row (never the provider text). */
export const FAILURE_CODES = ["SENDER_NOT_VERIFIED", "INVALID_ADDRESS", "PROVIDER_REJECTED", "RECIPIENT_INACTIVE", "RETRIES_EXHAUSTED"] as const;
export type FailureCode = (typeof FAILURE_CODES)[number];

export class EmailSendError extends Error {
  constructor(
    readonly code: SendFailureCode,
    message: string,
    readonly providerName: string | null = null,
    readonly statusCode: number | null = null,
  ) {
    super(message);
    this.name = "EmailSendError";
  }
  get permanent(): boolean {
    return this.code !== "TRANSIENT";
  }
}

type ProviderError = { name?: string | null; message?: string | null; statusCode?: number | null } | null | undefined;

const TRANSIENT_NAMES = new Set(["rate_limit_exceeded", "daily_quota_exceeded", "monthly_quota_exceeded", "application_error", "internal_server_error", "concurrent_idempotent_requests"]);
const SENDER_TEXT = /domain is not verified|only send testing emails|verify a domain/i;
const RECIPIENT_TEXT = /`to`|\bto\b field|recipient/i;

/** Maps a Resend error object (resend@6: { name, message, statusCode }) to a typed error. */
export function classifyResendError(err: ProviderError): EmailSendError {
  const name = err?.name ?? null;
  const message = err?.message ?? "unknown provider error";
  const status = err?.statusCode ?? null;
  const make = (code: SendFailureCode) => new EmailSendError(code, message, name, status);

  if (!err) return make("TRANSIENT");
  if (status === 429 || (name && TRANSIENT_NAMES.has(name))) return make("TRANSIENT");
  if (status !== null && status >= 500) return make("TRANSIENT");
  if (name === "invalid_from_address" || SENDER_TEXT.test(message)) return make("SENDER_NOT_VERIFIED");
  if ((name === "validation_error" || name === "invalid_parameter" || name === "missing_required_field") && RECIPIENT_TEXT.test(message)) {
    return make("INVALID_ADDRESS");
  }
  if (status !== null && status >= 400) return make("PROVIDER_REJECTED");
  return make("TRANSIENT");
}

/** Reads the stable code from a stored last_error; unknown text maps to null. */
export function failureCode(lastError: string | null, attempts: number): FailureCode | null {
  if (!lastError) return null;
  const prefix = lastError.split(":", 1)[0].trim();
  const known = FAILURE_CODES.find((c) => c === prefix);
  if (known) return known;
  // Rows written before codes existed: only exhausted retries reach FAILED with free text.
  return attempts >= MAX_ATTEMPTS && !/^[A-Z_]+:/.test(lastError) ? "RETRIES_EXHAUSTED" : null;
}
