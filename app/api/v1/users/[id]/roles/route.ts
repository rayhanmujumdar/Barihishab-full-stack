import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { setRoles } from "@/lib/users/admin-service";
import { toPublicUser } from "@/lib/users/dto";
import { RolesBodySchema } from "../schema";

export const PUT = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const body = await readJson(req, RolesBodySchema);
    if (!body.ok) return body.response;
    const result = await setRoles({ targetId: params.id, roles: body.data.roles, actor: { id: auth.userId, ...requestMeta(req) } });
    if (!result.ok) return apiError(result.code);
    return ok({ user: toPublicUser(result.user) });
  },
  { permission: "user.update", strict: true },
);
