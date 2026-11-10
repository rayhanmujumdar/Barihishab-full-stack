import { connection } from "next/server";
import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { getUser, updateUserAsAdmin } from "@/lib/users/admin-service";
import { rolesOf, toPublicUser } from "@/lib/users/dto";
import { PatchUserBodySchema } from "./schema";

type P = { id: string };

export const GET = withAuth<P>(
  async (_req, { params }) => {
    await connection();
    const user = isUuid(params.id) ? await getUser(params.id) : null;
    if (!user) return apiError("NOT_FOUND");
    return ok({ user: toPublicUser(user), roles: rolesOf(user), lastLoginAt: user.lastLoginAt?.toISOString() ?? null }, { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "user.list", strict: true },
);

export const PATCH = withAuth<P>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const body = await readJson(req, PatchUserBodySchema);
    if (!body.ok) return body.response;
    const result = await updateUserAsAdmin(params.id, body.data, { id: auth.userId, ...requestMeta(req) });
    if (!result.ok) return failResponse(result);
    return ok({ user: toPublicUser(result.user as Parameters<typeof toPublicUser>[0]) });
  },
  { permission: "user.update", strict: true },
);
