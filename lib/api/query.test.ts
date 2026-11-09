import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./client";
import { ApiError, apiGet, attachmentFileUrl, makeQueryClient, queryErrorMessage, shouldRetry } from "./query";

vi.mock("./client", () => ({ apiFetch: vi.fn() }));
const api = vi.mocked(apiFetch);

const fail = (status: number, code = "X", message = "Nope") => ({ ok: false as const, status, error: { code, message } });

beforeEach(() => api.mockReset());

describe("apiGet", () => {
  it("returns data on success and forwards options", async () => {
    api.mockResolvedValueOnce({ ok: true, status: 200, data: { a: 1 } });
    await expect(apiGet("/x", { method: "POST", body: { b: 2 } })).resolves.toEqual({ a: 1 });
    expect(api).toHaveBeenCalledWith("/x", { method: "POST", body: { b: 2 } });
  });

  it("throws an ApiError carrying the failed result", async () => {
    api.mockResolvedValueOnce(fail(404, "NOT_FOUND", "Gone"));
    const err = await apiGet("/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, message: "Gone", error: { code: "NOT_FOUND" }, result: fail(404, "NOT_FOUND", "Gone") });
  });
});

describe("queryErrorMessage", () => {
  it("is null without an error", () => expect(queryErrorMessage(null, "net")).toBeNull());
  it("uses the API message", () => expect(queryErrorMessage(new ApiError(fail(422, "V", "Bad input")), "net")).toBe("Bad input"));
  it("uses the network text for status 0 and unknown errors", () => {
    expect(queryErrorMessage(new ApiError(fail(0, "NETWORK")), "net")).toBe("net");
    expect(queryErrorMessage(new TypeError("boom"), "net")).toBe("net");
  });
});

describe("shouldRetry", () => {
  it("never retries a 4xx", () => {
    expect(shouldRetry(0, new ApiError(fail(401)))).toBe(false);
    expect(shouldRetry(0, new ApiError(fail(404)))).toBe(false);
  });
  it("retries network / 5xx errors twice", () => {
    expect(shouldRetry(0, new ApiError(fail(500)))).toBe(true);
    expect(shouldRetry(1, new ApiError(fail(0)))).toBe(true);
    expect(shouldRetry(2, new ApiError(fail(503)))).toBe(false);
  });
  it("is the client's default retry policy", () => {
    expect(makeQueryClient().getDefaultOptions().queries?.retry).toBe(shouldRetry);
  });
});

describe("attachmentFileUrl", () => {
  it("points at the same-origin file proxy, never at storage", () => {
    expect(attachmentFileUrl("a1")).toBe("/api/v1/attachments/a1/file");
  });
  it("asks for a download when told to", () => {
    expect(attachmentFileUrl("a1", { download: true })).toBe("/api/v1/attachments/a1/file?download=1");
  });
  it("encodes the id", () => {
    expect(attachmentFileUrl("a/../b")).toBe("/api/v1/attachments/a%2F..%2Fb/file");
  });
});
