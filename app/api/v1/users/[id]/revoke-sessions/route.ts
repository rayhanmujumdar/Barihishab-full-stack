import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { forceLogout } from "@/lib/users/admin-service";

export const POST = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const result = await forceLogout(params.id, { id: auth.userId, ...requestMeta(req) });
    if (!result.ok) return apiError(result.code);
    return new Response(null, { status: 204 });
  },
  { permission: "user.session.revoke", strict: true },
);
