import { describe, expect, it } from "vitest";
import { emailEnv } from "./config";

describe("emailEnv (standalone worker config)", () => {
  it("needs only the email settings — no auth secrets or app URL", () => {
    const e = emailEnv({ NODE_ENV: "production", RESEND_API_KEY: "re_live", EMAIL_FROM: "BariHisab <no-reply@barihisab.com>" });
    expect(e).toMatchObject({ NODE_ENV: "production", EMAIL_FROM: "BariHisab <no-reply@barihisab.com>", EMAIL_WORKER: "auto" });
  });

  it("refuses a free-mail sender in production", () => {
    expect(() => emailEnv({ NODE_ENV: "production", RESEND_API_KEY: "re_live", EMAIL_FROM: "x@gmail.com" })).toThrow(/EMAIL_FROM/);
  });

  it("allows it in development (startup only warns)", () => {
    expect(emailEnv({ NODE_ENV: "development", RESEND_API_KEY: "re_live", EMAIL_FROM: "x@gmail.com" }).EMAIL_FROM).toBe("x@gmail.com");
  });

  it("accepts auto, on and off for EMAIL_WORKER and rejects anything else", () => {
    for (const v of ["auto", "on", "off"]) expect(emailEnv({ EMAIL_WORKER: v }).EMAIL_WORKER).toBe(v);
    expect(() => emailEnv({ EMAIL_WORKER: "yes" })).toThrow(/EMAIL_WORKER/);
  });
});
