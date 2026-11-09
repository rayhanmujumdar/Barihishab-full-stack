import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, refreshSession } from "./client";

const jsonRes = (status: number, body: unknown) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let cookie = "bh_csrf=tok1";
beforeEach(() => {
  vi.stubGlobal("document", {
    get cookie() {
      return cookie;
    },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  cookie = "bh_csrf=tok1";
});

describe("apiFetch", () => {
  it("sends JSON with the CSRF header on mutations and unwraps the envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, { success: true, data: { ok: 1 } }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await apiFetch("/me", { method: "PATCH", body: { phone: "01712345678" } });
    expect(res).toEqual({ ok: true, status: 200, data: { ok: 1 } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/me");
    expect(init.headers["X-CSRF-Token"]).toBe("tok1");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.credentials).toBe("same-origin");
    expect(init.body).toBe('{"phone":"01712345678"}');
  });

  it("does not send the CSRF header on GET", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, { success: true, data: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await apiFetch("/me/sessions");
    expect(fetchMock.mock.calls[0][1].headers["X-CSRF-Token"]).toBeUndefined();
  });

  it("refreshes once on 401 UNAUTHENTICATED and retries with the new CSRF token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(401, { success: false, error: { code: "UNAUTHENTICATED", message: "x" } }))
      .mockImplementationOnce(async () => {
        cookie = "bh_csrf=tok2";
        return jsonRes(200, { success: true, data: { csrfToken: "tok2" } });
      })
      .mockResolvedValueOnce(jsonRes(204, null));
    vi.stubGlobal("fetch", fetchMock);
    const res = await apiFetch("/auth/logout-all", { method: "POST" });
    expect(res).toEqual({ ok: true, status: 204, data: null });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/auth/refresh");
    expect(fetchMock.mock.calls[2][1].headers["X-CSRF-Token"]).toBe("tok2");
  });

  it("does not refresh for other 401 codes (e.g. a wrong current password)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(401, { success: false, error: { code: "INVALID_CREDENTIALS", message: "x" } }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await apiFetch("/me/password", { method: "POST", body: {} });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ ok: false, status: 401, error: { code: "INVALID_CREDENTIALS" } });
  });

  it("gives up after one failed refresh", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonRes(401, { success: false, error: { code: "UNAUTHENTICATED", message: "x" } }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await apiFetch("/me");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res).toMatchObject({ ok: false, status: 401 });
  });

  it("reports network failures without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await apiFetch("/me")).toEqual({ ok: false, status: 0, error: { code: "NETWORK", message: "Network error" } });
  });
});

describe("refreshSession", () => {
  it("coalesces parallel callers into one /auth/refresh", async () => {
    const fetchMock = vi.fn(async () => jsonRes(200, { success: true, data: {} }));
    vi.stubGlobal("fetch", fetchMock);
    const results = await Promise.all([refreshSession(), refreshSession(), refreshSession()]);
    expect(results).toEqual([true, true, true]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]).toEqual(["/api/v1/auth/refresh", expect.objectContaining({ method: "POST" })]);
  });

  it("reports a failed refresh", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes(401, { success: false, error: { code: "UNAUTHENTICATED", message: "x" } })));
    expect(await refreshSession()).toBe(false);
  });
});
