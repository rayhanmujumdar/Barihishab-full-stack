// Next 16 proxy (formerly middleware).
// 1. /[lang] routing: page URLs without a language segment are redirected to
//    the preferred language (bh_locale cookie → Accept-Language → bn).
// 2. Auth: only "is there a valid access token?" — never permissions (Auth PRD
//    §8 Authorization). Pages and API handlers check permissions themselves;
//    API routes are excluded by the matcher and return 401/403 on their own.
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/tokens";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n/locales";
import { localeFromPath, localePath, stripLocale } from "@/lib/i18n/paths";

const PUBLIC_PAGES = ["/login", "/forgot", "/reset", "/invite"];
// Top-level app routes; anything else without a locale is left to 404.
const APP_ROUTES = ["", "admin", "me", "entries", "settings", "login", "forgot", "reset", "invite"];

function isPublic(page: string) {
  return PUBLIC_PAGES.some((p) => page === p || page.startsWith(`${p}/`));
}

export function preferredLocale(request: NextRequest): Locale {
  const saved = request.cookies.get(COOKIE.locale)?.value;
  if (saved && (LOCALES as readonly string[]).includes(saved)) return saved as Locale;
  const accept = request.headers.get("accept-language") ?? "";
  const ranked = accept
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.split(";").map((x) => x.trim());
      const q = params.find((p) => p.startsWith("q="));
      return { lang: tag.toLowerCase().split("-")[0], q: q ? Number(q.slice(2)) : 1 };
    })
    .filter((r) => r.q > 0)
    .sort((a, b) => b.q - a.q);
  const hit = ranked.find((r) => (LOCALES as readonly string[]).includes(r.lang));
  return (hit?.lang as Locale) ?? DEFAULT_LOCALE;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const locale = localeFromPath(pathname);

  if (!locale) {
    const first = pathname.split("/")[1] ?? "";
    if (!APP_ROUTES.includes(first)) return NextResponse.next(); // unsupported lang / unknown → 404
    const url = new URL(`${localePath(preferredLocale(request), pathname)}${search}`, request.url);
    return NextResponse.redirect(url);
  }

  const page = stripLocale(pathname);
  const forward = new Headers(request.headers);
  forward.set("x-pathname", `${pathname}${search}`);
  const pass = () => NextResponse.next({ request: { headers: forward } });

  if (isPublic(page)) return pass();

  const access = await verifyAccessToken(request.cookies.get(COOKIE.access)?.value);
  if (access) return pass();

  const next = `${pathname}${search}`;
  if (request.cookies.get(COOKIE.refresh)?.value) {
    const url = new URL("/api/v1/auth/refresh", request.url);
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  const login = new URL(localePath(locale, "/login"), request.url);
  if (page !== "/") login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)"],
};
