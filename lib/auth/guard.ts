// The one server-side choke point for API auth (RBAC-01, design D3):
//   verify access JWT → (strict) confirm session/user still valid →
//   CSRF on mutations → permission check → handler.
import { apiError } from "@/lib/api/errors";
import { logError } from "@/lib/log";
import { can, permissionsFor, type Permission, type Role } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { readAccessCookie } from "./cookies";
import { checkCsrf, checkOrigin } from "./csrf";
import { findActiveSession, touchSession } from "./session-service";
import { verifyAccessToken } from "./tokens";

export type AuthContext = {
  userId: string;
  sessionId: string;
  tokenVersion: number;
  roles: Role[];
  permissions: Permission[];
};

/** Reads the access token from the bh_at cookie (or a Bearer header, for later mobile use). */
export async function getAuth(req: Request): Promise<AuthContext | null> {
  const header = req.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const claims = await verifyAccessToken(bearer ?? readAccessCookie(req));
  if (!claims) return null;
  return {
    userId: claims.sub,
    sessionId: claims.sid,
    tokenVersion: claims.ver,
    roles: claims.roles,
    permissions: permissionsFor(claims.roles),
  };
}

/** Strict check: the refresh session is live, the user ACTIVE and token_version current. */
export async function isAuthStillValid(auth: AuthContext): Promise<boolean> {
  const [session, user] = await Promise.all([
    findActiveSession(auth.sessionId),
    prisma.user.findUnique({ where: { id: auth.userId }, select: { status: true, tokenVersion: true } }),
  ]);
  if (!session || session.userId !== auth.userId) return false;
  if (!user || user.status !== "ACTIVE" || user.tokenVersion !== auth.tokenVersion) return false;
  await touchSession(session);
  return true;
}

type RouteCtx<P> = { params: Promise<P> };
type Handler<P> = (req: Request, ctx: { auth: AuthContext; params: P }) => Promise<Response>;

export type GuardOptions = {
  permission?: Permission;
  /** Re-check session + user in the DB. Default true; opt out only for cheap reads. */
  strict?: boolean;
  /** CSRF on POST/PATCH/PUT/DELETE. Default true. */
  csrf?: boolean;
};

export function withAuth<P = Record<string, string>>(handler: Handler<P>, opts: GuardOptions = {}) {
  return async (req: Request, ctx: RouteCtx<P>): Promise<Response> => {
    try {
      const auth = await getAuth(req);
      if (!auth) return apiError("UNAUTHENTICATED");
      if (opts.strict !== false && !(await isAuthStillValid(auth))) return apiError("UNAUTHENTICATED");
      if (opts.csrf !== false && !checkCsrf(req, auth.sessionId)) return apiError("CSRF_INVALID");
      if (opts.permission && !can(auth, opts.permission)) return apiError("FORBIDDEN");
      return await handler(req, { auth, params: await ctx.params });
    } catch (err) {
      logError(`api ${req.method} ${new URL(req.url).pathname}`, err);
      return apiError("INTERNAL_ERROR");
    }
  };
}

type PublicHandler<P> = (req: Request, ctx: { params: P }) => Promise<Response>;

/** Pre-session public routes: Origin check on mutations + uniform error handling. */
export function withPublic<P = Record<string, string>>(handler: PublicHandler<P>) {
  return async (req: Request, ctx: RouteCtx<P>): Promise<Response> => {
    try {
      if (!checkOrigin(req)) return apiError("CSRF_INVALID");
      return await handler(req, { params: await ctx.params });
    } catch (err) {
      logError(`api ${req.method} ${new URL(req.url).pathname}`, err);
      return apiError("INTERNAL_ERROR");
    }
  };
}
