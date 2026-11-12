import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { remindUnread } from "@/lib/notices/notice-service";
import { currentPropertyId } from "@/lib/property";

export const POST = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const r = await remindUnread(await currentPropertyId(), params.id, { id: auth.userId, ...requestMeta(req) });
    return r.ok ? ok({ reminded: r.reminded }) : failResponse(r);
  },
  { permission: "notice.manage" },
);
