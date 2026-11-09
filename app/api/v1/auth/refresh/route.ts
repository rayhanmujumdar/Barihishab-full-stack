import { connection } from "next/server";
import { apiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { appendClearedAuthCookies, COOKIE, readCookie, readRefreshCookie } from "@/lib/auth/cookies";
import { withPublic } from "@/lib/auth/guard";
import { withAuthCookies } from "@/lib/auth/issue";
import { refreshTokens } from "@/lib/auth/refresh-service";
import { requestMeta } from "@/lib/auth/request-meta";
import { safeNext } from "@/lib/auth/safe-redirect";
import { isLocale } from "@/lib/i18n/locales";
import { localeFromPath, localePath, stripLocale } from "@/lib/i18n/paths";

export const POST = withPublic(async (req) => {
  const result = await refreshTokens(readRefreshCookie(req), requestMeta(req));
  if (!result.ok) {
    const res = apiError("UNAUTHENTICATED");
    appendClearedAuthCookies(res.headers);
    return res;
  }
  return withAuthCookies(ok({ csrfToken: result.tokens.csrfToken }, { headers: { "Cache-Control": "no-store" } }), result.tokens);
});

// Page navigations with an expired access token land here (see proxy.ts).
export const GET = withPublic(async (req) => {
  await connection();
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  // GET rotates tokens, so refuse cross-site navigations (SameSite=Lax would
  // still send the cookie). Browsers set Sec-Fetch-Site; the proxy's own
  // redirect arrives as "same-origin", a typed URL as "none".
  const site = req.headers.get("sec-fetch-site");
  const crossSite = site !== null && site !== "same-origin" && site !== "none";
  const result = crossSite ? ({ ok: false } as const) : await refreshTokens(readRefreshCookie(req), requestMeta(req));
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (!result.ok) {
    if (!crossSite) appendClearedAuthCookies(headers);
    const saved = readCookie(req, COOKIE.locale);
    const lang = localeFromPath(next) ?? (isLocale(saved) ? saved : "bn");
    const login = new URL(localePath(lang, "/login"), url.origin);
    if (stripLocale(next) !== "/") login.searchParams.set("next", localePath(lang, next));
    headers.set("Location", login.toString());
    return new Response(null, { status: 307, headers });
  }
  headers.set("Location", new URL(next, url.origin).toString());
  return withAuthCookies(new Response(null, { status: 307, headers }), result.tokens);
});
