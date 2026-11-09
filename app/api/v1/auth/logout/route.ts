import { apiError } from "@/lib/api/errors";
import { audit } from "@/lib/audit";
import { appendClearedAuthCookies, COOKIE, readCookie } from "@/lib/auth/cookies";
import { checkCsrf } from "@/lib/auth/csrf";
import { getAuth, withPublic } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { revokeFamily } from "@/lib/auth/session-service";
import { hashToken } from "@/lib/auth/tokens";
import { prisma } from "@/lib/prisma";

export const POST = withPublic(async (req) => {
  const meta = requestMeta(req);
  const auth = await getAuth(req);
  let sessionId: string | null = null;
  let userId: string | null = null;

  if (auth) {
    if (!checkCsrf(req, auth.sessionId)) return apiError("CSRF_INVALID");
    sessionId = auth.sessionId;
    userId = auth.userId;
  } else {
    // Access token expired: identify the session by its refresh token instead.
    const raw = readCookie(req, COOKIE.refresh);
    const session = raw ? await prisma.authSession.findUnique({ where: { tokenHash: hashToken(raw) } }) : null;
    sessionId = session?.id ?? null;
    userId = session?.userId ?? null;
  }

  if (sessionId && userId) {
    await prisma.$transaction(async (tx) => {
      // Revoke the whole refresh family, so grace-window siblings die too.
      const session = await tx.authSession.findUnique({ where: { id: sessionId }, select: { familyId: true } });
      if (session && (await revokeFamily(session.familyId, "logout", tx)) > 0) {
        await audit(tx, { actorId: userId, action: "auth.logout", entityType: "user", entityId: userId, after: { sessionId }, ...meta });
      }
    });
  }

  const res = new Response(null, { status: 204 });
  appendClearedAuthCookies(res.headers);
  return res;
});
