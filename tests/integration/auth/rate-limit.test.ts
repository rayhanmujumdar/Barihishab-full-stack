import { afterEach, describe, expect, it, vi } from "vitest";
import { hit, LIMITS } from "@/lib/auth/rate-limit";
import { clientIp } from "@/lib/auth/request-meta";

const T0 = new Date("2026-11-09T00:00:00Z");
function freeze(ms = 0) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(T0.getTime() + ms));
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("rate limiter", () => {
  it("allows 10 auth requests per minute per IP, blocks the 11th with retry-after", async () => {
    freeze();
    for (let i = 0; i < 10; i++) expect((await hit(LIMITS.authPerIp, "1.1.1.1")).allowed).toBe(true);
    freeze(20_000);
    const blocked = await hit(LIMITS.authPerIp, "1.1.1.1");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(40);
    expect((await hit(LIMITS.authPerIp, "2.2.2.2")).allowed).toBe(true);
  });

  it("allows 5 login attempts per minute per identifier, case-insensitively", async () => {
    freeze();
    for (let i = 0; i < 5; i++) expect((await hit(LIMITS.loginPerIdentifier, i % 2 ? "Rahim" : "rahim")).allowed).toBe(true);
    expect((await hit(LIMITS.loginPerIdentifier, "RAHIM")).allowed).toBe(false);
  });

  it("starts a fresh window after it expires", async () => {
    freeze();
    for (let i = 0; i < 11; i++) await hit(LIMITS.authPerIp, "3.3.3.3");
    freeze(60_001);
    expect((await hit(LIMITS.authPerIp, "3.3.3.3")).allowed).toBe(true);
  });

  it("limits reset emails to 3 per hour per account", async () => {
    freeze();
    for (let i = 0; i < 3; i++) expect((await hit(LIMITS.resetEmailPerAccount, "u1")).allowed).toBe(true);
    freeze(59 * 60_000);
    expect((await hit(LIMITS.resetEmailPerAccount, "u1")).allowed).toBe(false);
  });
});

describe("clientIp", () => {
  it("ignores X-Forwarded-For unless TRUST_PROXY=true", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1", "x-real-ip": "8.8.8.8" } });
    vi.stubEnv("TRUST_PROXY", "false");
    expect(clientIp(req)).toBe("unknown");
    vi.stubEnv("TRUST_PROXY", "true");
    expect(clientIp(req)).toBe("10.0.0.1");
  });
});
