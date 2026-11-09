import { apiError } from "@/lib/api/errors";
import { audit } from "@/lib/audit";
import { appendClearedAuthCookies } from "@/lib/auth/cookies";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { revokeFamily } from "@/lib/auth/session-service";
import { prisma } from "@/lib/prisma";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DELETE = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    if (!UUID.test(params.id)) return apiError("NOT_FOUND");
    const session = await prisma.authSession.findUnique({ where: { id: params.id } });
    // Someone else's session is indistinguishable from a missing one.
    if (!session || session.userId !== auth.userId || session.revokedAt) return apiError("NOT_FOUND");

    await prisma.$transaction(async (tx) => {
      await revokeFamily(session.familyId, "revoked_by_user", tx);
      await audit(tx, { actorId: auth.userId, action: "auth.logout", entityType: "user", entityId: auth.userId, after: { sessionId: session.id, by: "self" }, ...requestMeta(req) });
    });
    const res = new Response(null, { status: 204 });
    const current = await prisma.authSession.findUnique({ where: { id: auth.sessionId }, select: { familyId: true } });
    if (current?.familyId === session.familyId) appendClearedAuthCookies(res.headers);
    return res;
  },
  { permission: "session.manage.self", strict: true },
);
