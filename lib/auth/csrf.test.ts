import { describe, expect, it } from "vitest";
import { checkCsrf, checkOrigin } from "./csrf";
import { deriveCsrfToken } from "./tokens";

const SID = "22222222-2222-4222-8222-222222222222";
const ORIGIN = process.env.APP_URL!;

function req(method: string, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/v1/auth/logout`, { method, headers });
}

describe("checkOrigin", () => {
  it("accepts the app origin and rejects foreign or missing origins", () => {
    expect(checkOrigin(req("POST", { origin: ORIGIN }))).toBe(true);
    expect(checkOrigin(req("POST", { origin: "https://evil.example" }))).toBe(false);
    expect(checkOrigin(req("POST"))).toBe(false);
  });

  it("skips safe methods", () => {
    expect(checkOrigin(req("GET"))).toBe(true);
  });
});

describe("checkCsrf", () => {
  it("passes with matching origin and token", () => {
    expect(checkCsrf(req("POST", { origin: ORIGIN, "x-csrf-token": deriveCsrfToken(SID) }), SID)).toBe(true);
  });

  it("fails without the header, with a wrong token, or with a foreign origin", () => {
    expect(checkCsrf(req("POST", { origin: ORIGIN }), SID)).toBe(false);
    expect(checkCsrf(req("DELETE", { origin: ORIGIN, "x-csrf-token": "wrong" }), SID)).toBe(false);
    expect(checkCsrf(req("PATCH", { origin: "https://evil.example", "x-csrf-token": deriveCsrfToken(SID) }), SID)).toBe(false);
  });

  it("does not require a token for GET", () => {
    expect(checkCsrf(req("GET"), SID)).toBe(true);
  });
});

describe("same-origin on another port", () => {
  it("accepts the request's own origin even if APP_URL differs", () => {
    const r = new Request("http://localhost:55000/api/v1/auth/login", { method: "POST", headers: { origin: "http://localhost:55000" } });
    expect(checkOrigin(r)).toBe(true);
    const evil = new Request("http://localhost:55000/api/v1/auth/login", { method: "POST", headers: { origin: "http://localhost:55001" } });
    expect(checkOrigin(evil)).toBe(false);
  });
});
