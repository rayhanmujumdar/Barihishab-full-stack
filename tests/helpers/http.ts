import { createSession } from "@/lib/auth/session-service";
import { COOKIE } from "@/lib/auth/cookies";
import { deriveCsrfToken, signAccessToken } from "@/lib/auth/tokens";
import type { Role } from "@/lib/permissions";

export const ORIGIN = process.env.APP_URL ?? "http://localhost:3000";

export type Login = {
  userId: string;
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  cookie: string;
};

/** Logs a user in directly (no HTTP) and returns ready-to-send credentials. */
export async function loginAs(
  user: { id: string; tokenVersion?: number; roles: { role: Role }[] },
  opts: { remember?: boolean } = {},
): Promise<Login> {
  const { session, refreshToken } = await createSession({ userId: user.id, remember: opts.remember ?? true });
  const accessToken = await signAccessToken({
    sub: user.id,
    sid: session.id,
    ver: user.tokenVersion ?? 0,
    roles: user.roles.map((r) => r.role),
  });
  const csrfToken = deriveCsrfToken(session.id);
  return {
    userId: user.id,
    sessionId: session.id,
    accessToken,
    refreshToken,
    csrfToken,
    cookie: `${COOKIE.access}=${accessToken}; ${COOKIE.refresh}=${refreshToken}; ${COOKIE.csrf}=${csrfToken}`,
  };
}

type ReqOpts = {
  method?: string;
  body?: unknown;
  login?: Login | null;
  cookie?: string;
  csrf?: boolean | string;
  origin?: string | null;
  headers?: Record<string, string>;
};

export function apiRequest(path: string, opts: ReqOpts = {}): Request {
  const method = opts.method ?? (opts.body === undefined ? "GET" : "POST");
  const headers: Record<string, string> = { "user-agent": "vitest-agent", ...opts.headers };
  if (opts.origin !== null && method !== "GET") headers.origin = opts.origin ?? ORIGIN;
  const cookie = opts.cookie ?? opts.login?.cookie;
  if (cookie) headers.cookie = cookie;
  if (opts.login && opts.csrf !== false && method !== "GET") {
    headers["x-csrf-token"] = typeof opts.csrf === "string" ? opts.csrf : opts.login.csrfToken;
  }
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`${ORIGIN}/api/v1${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

export function params<T extends Record<string, string>>(p: T) {
  return { params: Promise.resolve(p) };
}

export async function json(res: Response) {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** Parses Set-Cookie headers into { name: { value, attrs } }. */
export function setCookies(res: Response): Record<string, { value: string; raw: string }> {
  const out: Record<string, { value: string; raw: string }> = {};
  for (const raw of res.headers.getSetCookie()) {
    const [pair] = raw.split(";");
    const idx = pair.indexOf("=");
    out[pair.slice(0, idx)] = { value: decodeURIComponent(pair.slice(idx + 1)), raw };
  }
  return out;
}

/** Turns a login response's Set-Cookie into a Cookie header for the next request. */
export function cookieHeaderFrom(res: Response): string {
  return Object.entries(setCookies(res))
    .filter(([, c]) => c.value)
    .map(([k, c]) => `${k}=${encodeURIComponent(c.value)}`)
    .join("; ");
}
