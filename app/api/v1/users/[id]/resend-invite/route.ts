import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { resendInvite } from "@/lib/users/admin-service";

export const POST = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const result = await resendInvite(params.id, { id: auth.userId, ...requestMeta(req) });
    if (!result.ok) return apiError(result.code);
    return new Response(null, { status: 202 });
  },
  { permission: "user.invite.resend", strict: true },
);
