import { describe, expect, it } from "vitest";
import { checkPassword, PASSWORD_MAX, PASSWORD_MIN } from "./password-policy";

const ctx = { username: "rahimuddin", email: "rahim@example.com" };

describe("checkPassword", () => {
  it("accepts a strong password", () => {
    expect(checkPassword("Gh7!tree-river", ctx)).toEqual({ ok: true });
  });

  it("rejects passwords shorter than 8 or longer than 128", () => {
    expect(PASSWORD_MIN).toBe(8);
    expect(PASSWORD_MAX).toBe(128);
    expect(checkPassword("Ab1!xyz", ctx)).toEqual({ ok: false, reason: "TOO_SHORT" });
    expect(checkPassword("a".repeat(129), ctx)).toEqual({ ok: false, reason: "TOO_LONG" });
    expect(checkPassword("Zq9#".repeat(32), ctx).ok).toBe(true);
  });

  it("rejects a password equal to the username or email, ignoring case", () => {
    expect(checkPassword("RahimUddin", ctx)).toEqual({ ok: false, reason: "MATCHES_IDENTITY" });
    expect(checkPassword("RAHIM@example.com", ctx)).toEqual({ ok: false, reason: "MATCHES_IDENTITY" });
  });

  it("rejects passwords on the breached top-10k list, ignoring case", () => {
    expect(checkPassword("password123", ctx)).toEqual({ ok: false, reason: "TOO_COMMON" });
    expect(checkPassword("Password123", ctx)).toEqual({ ok: false, reason: "TOO_COMMON" });
    expect(checkPassword("qwertyuiop", ctx)).toEqual({ ok: false, reason: "TOO_COMMON" });
  });

  it("works without identity context", () => {
    expect(checkPassword("Gh7!tree-river").ok).toBe(true);
  });
});
