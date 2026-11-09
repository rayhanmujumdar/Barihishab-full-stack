import { SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  deriveCsrfToken,
  generateOpaqueToken,
  hashToken,
  safeEqual,
  signAccessToken,
  verifyAccessToken,
  verifyCsrfToken,
} from "./tokens";

const claims = { sub: "11111111-1111-4111-8111-111111111111", sid: "22222222-2222-4222-8222-222222222222", ver: 3, roles: ["OWNER" as const] };

afterEach(() => vi.useRealTimers());

describe("access token (JWT)", () => {
  it("lives 15 minutes", () => {
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(900);
  });

  it("round-trips its claims", async () => {
    const token = await signAccessToken(claims);
    const verified = await verifyAccessToken(token);
    expect(verified).toMatchObject(claims);
    expect(verified!.exp - verified!.iat).toBe(900);
  });

  it("is rejected after 15 minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-09T00:00:00Z"));
    const token = await signAccessToken(claims);
    vi.setSystemTime(new Date("2026-11-09T00:14:59Z"));
    expect(await verifyAccessToken(token)).not.toBeNull();
    vi.setSystemTime(new Date("2026-11-09T00:15:01Z"));
    expect(await verifyAccessToken(token)).toBeNull();
  });

  it("is rejected when tampered with or signed by another key", async () => {
    const token = await signAccessToken(claims);
    const [h, p, s] = token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ ...claims, roles: ["SUPER_ADMIN"] })).toString("base64url");
    expect(await verifyAccessToken(`${h}.${forgedPayload}.${s}`)).toBeNull();
    expect(await verifyAccessToken(`${h}.${p}.${s.slice(0, -2)}xx`)).toBeNull();

    const other = await new SignJWT({ ...claims })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode("another-secret-another-secret-another-secret"));
    expect(await verifyAccessToken(other)).toBeNull();
  });

  it("rejects alg=none and garbage", async () => {
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.`;
    expect(await verifyAccessToken(none)).toBeNull();
    expect(await verifyAccessToken("garbage")).toBeNull();
    expect(await verifyAccessToken("")).toBeNull();
  });

  it("rejects a token with missing claims", async () => {
    const token = await new SignJWT({ sub: claims.sub })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("15m")
      .setIssuer("barihisab")
      .setAudience("barihisab-web")
      .sign(new TextEncoder().encode(process.env.AUTH_JWT_SECRET));
    expect(await verifyAccessToken(token)).toBeNull();
  });
});

describe("opaque tokens", () => {
  it("are 32 random bytes in base64url", () => {
    const a = generateOpaqueToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
    expect(generateOpaqueToken()).not.toBe(a);
  });

  it("hash to 64-char SHA-256 hex, deterministically", () => {
    const raw = generateOpaqueToken();
    expect(hashToken(raw)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(raw)).toBe(hashToken(raw));
    expect(hashToken(raw)).not.toBe(hashToken(`${raw}x`));
  });

  it("compare in constant time and handle length mismatch", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("CSRF token", () => {
  it("is derived from the session id and verifiable", () => {
    const csrf = deriveCsrfToken(claims.sid);
    expect(csrf).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(verifyCsrfToken(claims.sid, csrf)).toBe(true);
    expect(verifyCsrfToken("33333333-3333-4333-8333-333333333333", csrf)).toBe(false);
    expect(verifyCsrfToken(claims.sid, null)).toBe(false);
    expect(verifyCsrfToken(claims.sid, "")).toBe(false);
  });
});

describe("configuration", () => {
  it("refuses to sign without a strong secret", async () => {
    const original = process.env.AUTH_JWT_SECRET;
    process.env.AUTH_JWT_SECRET = "short";
    try {
      await expect(signAccessToken(claims)).rejects.toThrow(/AUTH_JWT_SECRET/);
    } finally {
      process.env.AUTH_JWT_SECRET = original;
    }
  });
});
