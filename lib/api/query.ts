// TanStack Query layer over `apiFetch` (lib/api/client.ts). Every client-side
// /api/v1 call goes through here so it is cached, de-duplicated and visible in
// the React Query devtools:
//   - reads   → `useQuery` / `useInfiniteQuery` with `apiGet` + a key from `qk`
//   - writes  → `useApiMutation`, which invalidates the keys it lists

import { QueryClient, useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { apiFetch, type ApiErrorBody, type ApiResult } from "./client";

type ApiFailure = Extract<ApiResult<unknown>, { ok: false }>;

/** A non-2xx (or network) result, thrown so TanStack Query marks the query/mutation as errored. */
export class ApiError extends Error {
  readonly status: number;
  readonly error: ApiErrorBody;
  constructor(readonly result: ApiFailure) {
    super(result.error.message);
    this.name = "ApiError";
    this.status = result.status;
    this.error = result.error;
  }
}

/** Unwraps the envelope for `queryFn`s: data on success, throws `ApiError` otherwise. */
export async function apiGet<T>(path: string, opts?: Parameters<typeof apiFetch>[1]): Promise<T> {
  const res = await apiFetch<T>(path, opts);
  if (!res.ok) throw new ApiError(res);
  return res.data;
}

/** Message for an `ApiError` (or anything else a query threw). */
export function queryErrorMessage(err: unknown, networkText: string): string | null {
  if (!err) return null;
  if (err instanceof ApiError) return err.status === 0 ? networkText : err.message;
  return networkText;
}

export type TxnListFilter = { period: string; kind: string; category: string };
export type UserListFilter = { q: string; role: string; status: string };

/**
 * Query-key factory. Keys are hierarchical so one `invalidateQueries({ queryKey: qk.transactions.all })`
 * after a write refreshes every list, detail and preview that depends on it.
 */
export const qk = {
  transactions: {
    all: ["transactions"] as const,
    list: (f: TxnListFilter) => ["transactions", "list", f] as const,
    detail: (id: string) => ["transactions", "detail", id] as const,
    vendors: (q: string) => ["transactions", "vendors", q] as const,
    rentPreview: (period: string) => ["transactions", "rent-preview", period] as const,
  },
  users: {
    all: ["users"] as const,
    list: (f: UserListFilter) => ["users", "list", f] as const,
  },
  owners: { all: ["owners"] as const },
  me: { all: ["me"] as const },
};

/** Same-origin URL of a bill/receipt (thumbnails, lightbox, PDF links). */
export { attachmentFileUrl } from "@/lib/attachments/file-url";

/** Retry transient failures only: never a 4xx (auth/validation/not-found won't fix itself). */
export function shouldRetry(failureCount: number, err: unknown): boolean {
  if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
  return failureCount < 2;
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Pages arrive server-rendered; a short staleTime stops the client from
        // immediately re-fetching what the server just sent (`initialData`).
        staleTime: 30_000,
        retry: shouldRetry,
      },
      mutations: { retry: false },
    },
  });
}

/**
 * `useMutation` that keeps the `ApiResult` contract the forms already use:
 * `run(vars)` resolves to the `ApiResult` (ok or not) and never throws for API
 * errors, while TanStack still records failures as errors (devtools, `isError`).
 * On success it invalidates every key in `invalidate`. `mutationKey` labels it in the devtools.
 */
export function useApiMutation<T = unknown, V = void>(
  mutationKey: QueryKey,
  request: (vars: V) => Promise<ApiResult<T>>,
  opts: { invalidate?: readonly QueryKey[] } = {},
) {
  const qc = useQueryClient();
  const { invalidate = [] } = opts;
  const m = useMutation<Extract<ApiResult<T>, { ok: true }>, ApiError, V>({
    mutationKey,
    mutationFn: async (vars) => {
      const res = await request(vars);
      if (!res.ok) throw new ApiError(res);
      return res;
    },
    // Fire-and-forget: the caller gets its result now, lists refresh in the background.
    onSuccess: () => {
      for (const queryKey of invalidate) void qc.invalidateQueries({ queryKey });
    },
  });
  const { mutateAsync } = m;
  const run = useCallback(
    async (vars: V): Promise<ApiResult<T>> => {
      try {
        return await mutateAsync(vars);
      } catch (err) {
        if (err instanceof ApiError) return err.result as ApiResult<T>;
        throw err;
      }
    },
    [mutateAsync],
  );
  return { run, isPending: m.isPending, reset: m.reset };
}

/** Server objects already written into each client's cache (see `useServerSeed`). */
const seeded = new WeakMap<QueryClient, WeakSet<object>>();

/**
 * Keeps a server-rendered prop authoritative over an older cache entry.
 * `initialData` is ignored once a key is cached, so without this a revisit
 * would show the cached list while the server-rendered totals are newer.
 * Each server object is written once per client: a back/forward navigation
 * that re-mounts with an old RSC payload can't overwrite fresher client data.
 */
export function useServerSeed<P extends object, D>(queryKey: QueryKey, serverData: P | null | undefined, toCache: (p: P) => D) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!serverData) return;
    let done = seeded.get(qc);
    if (!done) seeded.set(qc, (done = new WeakSet()));
    if (done.has(serverData)) return;
    done.add(serverData);
    qc.setQueryData(queryKey, toCache(serverData));
    // `queryKey` and `toCache` are derived from `serverData` by every caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, serverData]);
}
