import { describe, expect, it } from "vitest";
import { mask } from "./log";

describe("mask (no secrets in logs)", () => {
  it("redacts password/token/cookie key-values, JWTs, opaque tokens and emails", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJlc2lnbmF0dXJl";
    const raw = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";
    const out = mask(`password=hunter2 token: "${raw}" cookie=bh_rt=${raw} jwt ${jwt} for rahim@example.com`);
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain(raw);
    expect(out).not.toContain(jwt);
    expect(out).not.toContain("rahim@example.com");
    expect(out).toContain("r***@example.com");
  });
});
