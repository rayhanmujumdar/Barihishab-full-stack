import { audit } from "@/lib/audit";
import { appendClearedAuthCookies } from "@/lib/auth/cookies";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { revokeAllSessions } from "@/lib/auth/session-service";
import { prisma } from "@/lib/prisma";

export const POST = withAuth(
  async (req, { auth }) => {
    const meta = requestMeta(req);
    await prisma.$transaction(async (tx) => {
      const count = await revokeAllSessions(tx, auth.userId, "logout_all");
      await audit(tx, { actorId: auth.userId, action: "auth.logout_all", entityType: "user", entityId: auth.userId, after: { revoked: count }, ...meta });
    });
    const res = new Response(null, { status: 204 });
    appendClearedAuthCookies(res.headers);
    return res;
  },
  { strict: true },
);
