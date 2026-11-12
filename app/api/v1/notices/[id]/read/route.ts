import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { markRead } from "@/lib/notices/notice-service";
import { currentPropertyId } from "@/lib/property";

export const POST = withAuth<{ id: string }>(
  async (_req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const r = await markRead(await currentPropertyId(), params.id, auth.userId);
    return r.ok ? ok({ unread: r.unread }) : failResponse(r);
  },
  { permission: "notice.view" },
);
