import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { editNotice } from "@/lib/notices/notice-service";
import { currentPropertyId } from "@/lib/property";
import { EditNoticeBodySchema } from "./schema";

export const PATCH = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const body = await readJson(req, EditNoticeBodySchema);
    if (!body.ok) return body.response;
    const r = await editNotice(await currentPropertyId(), params.id, body.data, { id: auth.userId, ...requestMeta(req) });
    return r.ok ? ok({ notice: r.notice, emailed: r.emailed }) : failResponse(r);
  },
  { permission: "notice.manage" },
);
