import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { reactivateUser } from "@/lib/users/admin-service";
import { toPublicUser } from "@/lib/users/dto";
import { ReasonBodySchema } from "../schema";

export const POST = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const body = await readJson(req, ReasonBodySchema);
    if (!body.ok) return body.response;
    const result = await reactivateUser({ targetId: params.id, reason: body.data.reason, actor: { id: auth.userId, ...requestMeta(req) } });
    if (!result.ok) return apiError(result.code);
    return ok({ user: toPublicUser(result.user) });
  },
  { permission: "user.deactivate", strict: true },
);
