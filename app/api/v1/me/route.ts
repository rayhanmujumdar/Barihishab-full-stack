import { connection } from "next/server";
import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { withAuth, type AuthContext } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sessionPayload } from "@/lib/users/dto";
import { updateUserProfile } from "@/lib/users/user-service";
import { PatchMeBodySchema } from "./schema";

function meBody(user: Parameters<typeof sessionPayload>[0]) {
  const { user: profile, roles, permissions } = sessionPayload(user);
  return { profile, roles, permissions };
}

export const GET = withAuth(async (_req, { auth }) => {
  await connection();
  const user = await prisma.user.findUnique({ where: { id: auth.userId }, include: { roles: true } });
  if (!user) return apiError("UNAUTHENTICATED");
  return ok(meBody(user), { headers: { "Cache-Control": "no-store" } });
});

export const PATCH = withAuth(
  async (req, { auth }: { auth: AuthContext }) => {
    const body = await readJson(req, PatchMeBodySchema);
    if (!body.ok) return body.response;
    const touchesIdentity = body.data.email !== undefined || body.data.username !== undefined;
    if (touchesIdentity && !can(auth, "profile.identity.self")) return apiError("FORBIDDEN");

    const result = await updateUserProfile(auth.userId, body.data, { id: auth.userId, ...requestMeta(req) });
    if (!result.ok) return apiError(result.code);
    return ok(meBody(result.user as Parameters<typeof sessionPayload>[0]));
  },
  { permission: "profile.update.self" },
);
