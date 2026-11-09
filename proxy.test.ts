import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { signAccessToken } from "@/lib/auth/tokens";
import { proxy } from "./proxy";

const BASE = "http://localhost:3000";
const claims = { sub: "11111111-1111-4111-8111-111111111111", sid: "22222222-2222-4222-8222-222222222222", ver: 0, roles: ["OWNER" as const] };

function req(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`${BASE}${path}`, { headers });
}

describe("proxy: /[lang] routing", () => {
  it("redirects the money screens without a language too", async () => {
    expect((await proxy(req("/entries?period=2026-10"))).headers.get("location")).toBe(`${BASE}/bn/entries?period=2026-10`);
    expect((await proxy(req("/settings"))).headers.get("location")).toBe(`${BASE}/bn/settings`);
  });

  it("redirects a path without a language to Bangla by default", async () => {
    const res = await proxy(req("/admin/users?q=ka"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${BASE}/bn/admin/users?q=ka`);
    expect((await proxy(req("/"))).headers.get("location")).toBe(`${BASE}/bn`);
  });

  it("uses the saved bh_locale cookie, then Accept-Language", async () => {
    expect((await proxy(req("/me", { cookie: "bh_locale=en" }))).headers.get("location")).toBe(`${BASE}/en/me`);
    expect((await proxy(req("/login", { "accept-language": "en-US,en;q=0.9,bn;q=0.5" }))).headers.get("location")).toBe(`${BASE}/en/login`);
    expect((await proxy(req("/login", { "accept-language": "fr-FR,fr" }))).headers.get("location")).toBe(`${BASE}/bn/login`);
  });

  it("leaves unsupported languages and unknown paths alone so they 404", async () => {
    expect((await proxy(req("/xx/admin/users"))).headers.get("x-middleware-next")).toBe("1");
    expect((await proxy(req("/fr"))).headers.get("x-middleware-next")).toBe("1");
  });
});

describe("proxy: auth", () => {
  it("lets public auth pages through without a session", async () => {
    for (const path of ["/en/login", "/bn/forgot", "/en/reset/abc", "/bn/invite/abc"]) {
      const res = await proxy(req(path));
      expect(res.headers.get("x-middleware-next"), path).toBe("1");
    }
  });

  it("redirects anonymous page visits to the localized /login with a safe next", async () => {
    const res = await proxy(req("/en/admin/users?q=ka"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${BASE}/en/login?next=%2Fen%2Fadmin%2Fusers%3Fq%3Dka`);
  });

  it("does not add next for the home page", async () => {
    expect((await proxy(req("/bn"))).headers.get("location")).toBe(`${BASE}/bn/login`);
  });

  it("passes a valid access token through and forwards the pathname", async () => {
    const token = await signAccessToken(claims);
    const res = await proxy(req("/en/me", { cookie: `bh_at=${token}` }));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("x-middleware-request-x-pathname")).toBe("/en/me");
  });

  it("sends an expired/missing access token with a refresh cookie to the refresh endpoint", async () => {
    const res = await proxy(req("/en/admin/users", { cookie: "bh_at=expired; bh_rt=some-refresh" }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${BASE}/api/v1/auth/refresh?next=%2Fen%2Fadmin%2Fusers`);
  });

  it("never decides permissions: an Owner token reaches /en/admin/users (the page renders its own 403 view)", async () => {
    const token = await signAccessToken(claims);
    const res = await proxy(req("/en/admin/users", { cookie: `bh_at=${token}` }));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
