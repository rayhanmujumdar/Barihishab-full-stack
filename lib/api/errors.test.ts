import { describe, expect, it } from "vitest";
import { z } from "zod";
import { apiError, ERRORS, validationError } from "./errors";

describe("error catalogue", () => {
  it("maps every PRD error code to its HTTP status", () => {
    expect(ERRORS.UNAUTHENTICATED.status).toBe(401);
    expect(ERRORS.INVALID_CREDENTIALS.status).toBe(401);
    expect(ERRORS.ACCOUNT_LOCKED.status).toBe(423);
    expect(ERRORS.RATE_LIMITED.status).toBe(429);
    expect(ERRORS.FORBIDDEN.status).toBe(403);
    expect(ERRORS.CSRF_INVALID.status).toBe(403);
    expect(ERRORS.TOKEN_EXPIRED.status).toBe(410);
    expect(ERRORS.TOKEN_USED.status).toBe(410);
    expect(ERRORS.LAST_SUPER_ADMIN.status).toBe(409);
    expect(ERRORS.USERNAME_TAKEN.status).toBe(409);
    expect(ERRORS.EMAIL_TAKEN.status).toBe(409);
    expect(ERRORS.VALIDATION_FAILED.status).toBe(422);
  });

  it("maps the Income & Expenses PRD §10.5 codes", () => {
    expect(ERRORS.PERIOD_CLOSED.status).toBe(409);
    expect(ERRORS.ALREADY_VOIDED.status).toBe(409);
    expect(ERRORS.IDEMPOTENCY_CONFLICT.status).toBe(409);
    expect(ERRORS.ENTRY_CHANGED.status).toBe(409);
    expect(ERRORS.CATEGORY_LOCKED.status).toBe(409);
    expect(ERRORS.FUND_NOT_EMPTY.status).toBe(409);
    expect(ERRORS.NAME_TAKEN.status).toBe(409);
    expect(ERRORS.FILE_TOO_LARGE.status).toBe(413);
    expect(ERRORS.TOO_MANY_ATTACHMENTS.status).toBe(422);
    expect(ERRORS.PERIOD_CLOSED.en).toBe("That month is closed. Record an Adjustment in the open month instead.");
    expect(ERRORS.FILE_TOO_LARGE.en).toBe("Only JPG, PNG, WebP or PDF up to 5 MB.");
  });

  it("maps the Owners PRD §8 codes", () => {
    for (const code of ["USER_ALREADY_OWNER", "NO_OPEN_PERIOD", "EXCEEDS_BALANCE", "NOT_VOIDABLE", "OPENING_LOCKED"] as const) {
      expect(ERRORS[code].status, code).toBe(409);
    }
    expect(ERRORS.NO_OPEN_PERIOD.en).toBe("Open a month first — payments are recorded in an open month.");
  });

  it("has an English and a Bangla message for every code", () => {
    for (const [code, e] of Object.entries(ERRORS)) {
      expect(e.en, code).toBeTruthy();
      expect(e.bn, code).toBeTruthy();
    }
  });

  it("uses the PRD wording for invalid credentials", () => {
    expect(ERRORS.INVALID_CREDENTIALS.en).toBe("Username/email or password is wrong.");
  });

  it("builds the project error envelope", async () => {
    const res = apiError("ACCOUNT_LOCKED", { details: { retryAfter: 900 } });
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual({
      success: false,
      error: { code: "ACCOUNT_LOCKED", message: ERRORS.ACCOUNT_LOCKED.en, details: { retryAfter: 900 } },
    });
  });

  it("can answer in Bangla and pass headers through", async () => {
    const res = apiError("RATE_LIMITED", { locale: "bn", headers: { "Retry-After": "30" } });
    expect(res.headers.get("Retry-After")).toBe("30");
    expect((await res.json()).error.message).toBe(ERRORS.RATE_LIMITED.bn);
  });

  it("turns zod issues into details.fields keyed by path", async () => {
    const schema = z.object({ username: z.string().min(3), profile: z.object({ phone: z.string().regex(/^01/) }) });
    const parsed = schema.safeParse({ username: "a", profile: { phone: "99" } });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const res = validationError(parsed.error);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(Object.keys(body.error.details.fields).sort()).toEqual(["profile.phone", "username"]);
  });
});
