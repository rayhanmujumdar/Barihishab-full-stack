import { afterEach, describe, expect, it, vi } from "vitest";
import { COOKIE, appendAuthCookies, appendClearedAuthCookies, readAccessCookie, readCookie, readCookieValues, readRefreshCookie } from "./cookies";

function setCookies(headers: Headers) {
  return headers.getSetCookie();
}

afterEach(() => vi.unstubAllEnvs());

describe("auth cookies", () => {
  it("sets httpOnly access + refresh and a readable CSRF cookie (remember me)", () => {
    const h = new Headers();
    appendAuthCookies(h, { accessToken: "a", refreshToken: "r", csrfToken: "c", remember: true });
    const [at, rt, csrf] = setCookies(h).filter((c) => c.includes("Path=/;"));
    expect(at).toMatch(/^bh_at=a; Path=\/; Max-Age=900; HttpOnly; SameSite=Lax$/);
    expect(rt).toMatch(/^bh_rt=r; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Lax$/);
    expect(csrf).toMatch(/^bh_csrf=c; Path=\/; Max-Age=2592000; SameSite=Lax$/);
  });

  it("makes the refresh cookie a browser-session cookie without remember me", () => {
    const h = new Headers();
    appendAuthCookies(h, { accessToken: "a", refreshToken: "r", csrfToken: "c", remember: false });
    const [, rt, csrf] = setCookies(h).filter((c) => c.includes("Path=/;"));
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
    const cleared = setCookies(h).filter((c) => c.includes("Path=/;"));
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

  it("deletes same-name shadow cookies under /api/v1 whenever auth cookies are set or cleared", () => {
    for (const write of [(h: Headers) => appendAuthCookies(h, { accessToken: "a", refreshToken: "r", csrfToken: "c", remember: true }), appendClearedAuthCookies]) {
      const h = new Headers();
      write(h);
      const shadows = setCookies(h).filter((c) => c.includes("Path=/api/v1;"));
      expect(shadows.map((c) => c.split("=")[0]).sort()).toEqual(["bh_at", "bh_csrf", "bh_rt"]);
      for (const c of shadows) expect(c).toMatch(/=; Path=\/api\/v1; Max-Age=0/);
    }
  });

  it("skips shadow values that aren't real tokens (Swagger UI placeholders)", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig_-1";
    const rt = "A".repeat(43);
    const placeholder = encodeURIComponent("(httpOnly cookie, sent by the browser)");
    const req = new Request("http://x", { headers: { cookie: `bh_at=${placeholder}; bh_rt=${placeholder}; bh_at=${jwt}; bh_rt=${rt}` } });
    expect(readCookieValues(req, COOKIE.access)).toEqual(["(httpOnly cookie, sent by the browser)", jwt]);
    expect(readAccessCookie(req)).toBe(jwt);
    expect(readRefreshCookie(req)).toBe(rt);
    expect(readAccessCookie(new Request("http://x"))).toBeNull();
    expect(readRefreshCookie(new Request("http://x", { headers: { cookie: "bh_rt=short" } }))).toBeNull();
  });
});
