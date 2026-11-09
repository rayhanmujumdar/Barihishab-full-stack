import { afterEach, describe, expect, it, vi } from "vitest";
import { COOKIE, appendAuthCookies, appendClearedAuthCookies, readCookie } from "./cookies";

function setCookies(headers: Headers) {
  return headers.getSetCookie();
}

afterEach(() => vi.unstubAllEnvs());

describe("auth cookies", () => {
  it("sets httpOnly access + refresh and a readable CSRF cookie (remember me)", () => {
    const h = new Headers();
    appendAuthCookies(h, { accessToken: "a", refreshToken: "r", csrfToken: "c", remember: true });
    const [at, rt, csrf] = setCookies(h);
    expect(at).toMatch(/^bh_at=a; Path=\/; Max-Age=900; HttpOnly; SameSite=Lax$/);
    expect(rt).toMatch(/^bh_rt=r; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Lax$/);
    expect(csrf).toMatch(/^bh_csrf=c; Path=\/; Max-Age=2592000; SameSite=Lax$/);
  });

  it("makes the refresh cookie a browser-session cookie without remember me", () => {
    const h = new Headers();
    appendAuthCookies(h, { accessToken: "a", refreshToken: "r", csrfToken: "c", remember: false });
    const [, rt, csrf] = setCookies(h);
    expect(rt).not.toMatch(/Max-Age|Expires/);
    expect(csrf).not.toMatch(/Max-Age|Expires/);
  });

  it("adds Secure in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const h = new Headers();
    appendAuthCookies(h, { accessToken: "a", refreshToken: "r", csrfToken: "c", remember: true });
    for (const c of setCookies(h)) expect(c).toMatch(/; Secure/);
  });

  it("clears all three cookies", () => {
    const h = new Headers();
    appendClearedAuthCookies(h);
    const cleared = setCookies(h);
    expect(cleared).toHaveLength(3);
    for (const c of cleared) expect(c).toMatch(/=; Path=\/; Max-Age=0/);
  });

  it("reads a cookie from a request", () => {
    const req = new Request("http://x", { headers: { cookie: `${COOKIE.access}=abc; other=1; ${COOKIE.refresh}=r%3D` } });
    expect(readCookie(req, COOKIE.access)).toBe("abc");
    expect(readCookie(req, COOKIE.refresh)).toBe("r=");
    expect(readCookie(req, "missing")).toBeNull();
    expect(readCookie(new Request("http://x"), COOKIE.access)).toBeNull();
  });
});
