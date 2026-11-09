// Browser fetch wrapper for /api/v1 (design D7): adds the CSRF header,
// unwraps the { success, data | error } envelope, and transparently refreshes
// an expired access token once.
export type ApiErrorBody = { code: string; message: string; details?: Record<string, unknown> & { fields?: Record<string, string> } };
export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: ApiErrorBody };

const PREFIX = "/api/v1";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

async function send<T>(path: string, method: string, body: unknown, extra?: Record<string, string>): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { Accept: "application/json", ...extra };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") {
    const csrf = readCookie("bh_csrf");
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }
  let res: Response;
  try {
    res = await fetch(`${PREFIX}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, error: { code: "NETWORK", message: "Network error" } };
  }
  let parsed: { success?: boolean; data?: T; error?: ApiErrorBody } | null = null;
  try {
    const text = res.status === 204 ? "" : await res.text();
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (res.ok) return { ok: true, status: res.status, data: (parsed?.data ?? null) as T };
  return { ok: false, status: res.status, error: parsed?.error ?? { code: "INTERNAL_ERROR", message: res.statusText } };
}

let refreshing: Promise<boolean> | null = null;
function refreshOnce(): Promise<boolean> {
  // Coalesce parallel 401s into a single refresh call.
  refreshing ??= send("/auth/refresh", "POST", undefined)
    .then((r) => r.ok)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/**
 * Renews the access token (one request however many callers). For requests
 * that can't refresh themselves, like an `<img>` hitting an expired token.
 */
export function refreshSession(): Promise<boolean> {
  return refreshOnce();
}

export async function apiFetch<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<ApiResult<T>> {
  const method = opts.method ?? "GET";
  const first = await send<T>(path, method, opts.body, opts.headers);
  if (first.ok || first.status !== 401 || first.error.code !== "UNAUTHENTICATED" || path.startsWith("/auth/refresh")) return first;
  if (!(await refreshOnce())) return first;
  return send<T>(path, method, opts.body, opts.headers);
}

/** Field errors from a 422/409 response, keyed by field name. */
export function fieldErrors(result: ApiResult<unknown>): Record<string, string> {
  if (result.ok) return {};
  return (result.error.details?.fields as Record<string, string> | undefined) ?? {};
}
