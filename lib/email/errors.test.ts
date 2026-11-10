import { describe, expect, it } from "vitest";
import { classifyResendError, EmailSendError, failureCode } from "./errors";

// Error objects as resend@6 returns them: { name, message, statusCode }.
const resend = (name: string, message: string, statusCode: number | null) => ({ name, message, statusCode });

describe("classifyResendError", () => {
  it.each([
    ["unverified gmail sender", resend("validation_error", "The gmail.com domain is not verified. Please, add and verify your domain on https://resend.com/domains", 403), "SENDER_NOT_VERIFIED", true],
    ["sandbox sender to a non-owner", resend("validation_error", "You can only send testing emails to your own email address (owner@example.com).", 403), "SENDER_NOT_VERIFIED", true],
    ["malformed from", resend("invalid_from_address", "Invalid `from` field.", 422), "SENDER_NOT_VERIFIED", true],
    ["bad recipient", resend("validation_error", "Invalid `to` field. The email address needs to follow the `email@example.com` format.", 422), "INVALID_ADDRESS", true],
    ["bad recipient parameter", resend("invalid_parameter", "Invalid `to` field.", 422), "INVALID_ADDRESS", true],
    ["wrong API key", resend("invalid_api_key", "API key is invalid", 401), "PROVIDER_REJECTED", true],
    ["restricted key", resend("restricted_api_key", "This API key is restricted", 401), "PROVIDER_REJECTED", true],
    ["rate limit", resend("rate_limit_exceeded", "Too many requests", 429), "TRANSIENT", false],
    ["daily quota", resend("daily_quota_exceeded", "You have reached your daily quota", 429), "TRANSIENT", false],
    ["provider outage", resend("internal_server_error", "Something went wrong", 500), "TRANSIENT", false],
    ["application error without status", resend("application_error", "Unable to fetch data", null), "TRANSIENT", false],
  ])("%s → %s", (_label, err, code, permanent) => {
    const e = classifyResendError(err);
    expect(e).toBeInstanceOf(EmailSendError);
    expect(e.code).toBe(code);
    expect(e.permanent).toBe(permanent);
    expect(e.providerName).toBe(err.name);
  });

  it("treats a missing error object as transient", () => {
    expect(classifyResendError(null)).toMatchObject({ code: "TRANSIENT", permanent: false });
  });
});

describe("failureCode", () => {
  it.each([
    ["SENDER_NOT_VERIFIED: The g***@gmail.com domain…", 1, "SENDER_NOT_VERIFIED"],
    ["INVALID_ADDRESS: Invalid `to` field", 1, "INVALID_ADDRESS"],
    ["PROVIDER_REJECTED: API key is invalid", 1, "PROVIDER_REJECTED"],
    ["RECIPIENT_INACTIVE", 0, "RECIPIENT_INACTIVE"],
    ["RETRIES_EXHAUSTED: provider down", 5, "RETRIES_EXHAUSTED"],
    // Rows written before codes existed.
    ["Resend: application_error boom", 5, "RETRIES_EXHAUSTED"],
    ["Resend: application_error boom", 2, null],
    ["NOT_A_CODE: whatever", 1, null],
    [null, 0, null],
  ] as const)("%s (attempts %i) → %s", (lastError, attempts, expected) => {
    expect(failureCode(lastError, attempts)).toBe(expected);
  });
});
