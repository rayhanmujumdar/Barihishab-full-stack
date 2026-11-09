import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { qk, useApiMutation, useServerSeed } from "@/lib/api/query";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, wrapper };
}

describe("useApiMutation", () => {
  it("resolves to the ok result and invalidates the listed keys", async () => {
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const request = vi.fn(async (n: number) => ({ ok: true as const, status: 200, data: n * 2 }));
    const { result } = renderHook(() => useApiMutation(["t", "double"], request, { invalidate: [qk.transactions.all] }), { wrapper });
    let res: unknown;
    await act(async () => {
      res = await result.current.run(21);
    });
    expect(res).toEqual({ ok: true, status: 200, data: 42 });
    expect(spy).toHaveBeenCalledWith({ queryKey: qk.transactions.all });
    expect(qc.getMutationCache().getAll()[0].options.mutationKey).toEqual(["t", "double"]);
  });

  it("returns the failed result instead of throwing, records an error and skips invalidation", async () => {
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const failed = { ok: false as const, status: 422, error: { code: "VALIDATION", message: "Bad" } };
    const { result } = renderHook(() => useApiMutation(["t", "fail"], async () => failed, { invalidate: [qk.users.all] }), { wrapper });
    let res: unknown;
    await act(async () => {
      res = await result.current.run();
    });
    expect(res).toEqual(failed);
    expect(spy).not.toHaveBeenCalled();
    expect(qc.getMutationCache().getAll()[0].state.status).toBe("error");
  });

  it("does not wait for the invalidation refetch before resolving", async () => {
    const { qc, wrapper } = setup();
    let release!: () => void;
    vi.spyOn(qc, "invalidateQueries").mockReturnValue(new Promise<void>((r) => (release = r)));
    const { result } = renderHook(() => useApiMutation(["t", "fast"], async () => ({ ok: true as const, status: 200, data: null }), { invalidate: [qk.users.all] }), { wrapper });
    await act(async () => {
      await expect(result.current.run()).resolves.toMatchObject({ ok: true });
    });
    release();
  });
});

describe("useServerSeed", () => {
  const key = ["seed", "list"];
  const toCache = (p: { items: string[] }) => p.items;

  it("overwrites an older cache entry with fresh server data", () => {
    const { qc, wrapper } = setup();
    qc.setQueryData(key, ["stale"]);
    renderHook(() => useServerSeed(key, { items: ["fresh"] }, toCache), { wrapper });
    expect(qc.getQueryData(key)).toEqual(["fresh"]);
  });

  it("writes each server object once, so a re-mount with an old payload can't clobber newer data", () => {
    const { qc, wrapper } = setup();
    const server = { items: ["v1"] };
    const first = renderHook(() => useServerSeed(key, server, toCache), { wrapper });
    first.unmount();
    qc.setQueryData(key, ["v2-from-client"]);
    renderHook(() => useServerSeed(key, server, toCache), { wrapper });
    expect(qc.getQueryData(key)).toEqual(["v2-from-client"]);
  });

  it("re-seeds when the server sends a new object", () => {
    const { qc, wrapper } = setup();
    const { rerender } = renderHook(({ s }) => useServerSeed(key, s, toCache), { wrapper, initialProps: { s: { items: ["a"] } } });
    rerender({ s: { items: ["b"] } });
    expect(qc.getQueryData(key)).toEqual(["b"]);
  });
});

describe("useDebouncedValue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("only updates after the value settles", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 250), { initialProps: { v: "a" } });
    expect(result.current).toBe("a");
    rerender({ v: "ab" });
    act(() => vi.advanceTimersByTime(200));
    rerender({ v: "abc" });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe("a");
    act(() => vi.advanceTimersByTime(60));
    expect(result.current).toBe("abc");
  });
});
