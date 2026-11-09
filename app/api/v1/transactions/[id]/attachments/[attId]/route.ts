import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { failResponse } from "@/lib/api/result";
import { removeAttachment } from "@/lib/attachments/attachment-service";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { currentPropertyId } from "@/lib/property";

export const DELETE = withAuth<{ id: string; attId: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id) || !isUuid(params.attId)) return apiError("NOT_FOUND");
    const r = await removeAttachment(await currentPropertyId(), params.id, params.attId, { id: auth.userId, ...requestMeta(req) });
    return r.ok ? new Response(null, { status: 204 }) : failResponse(r);
  },
  { permission: "transaction.update" },
);
