import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { addAttachments } from "@/lib/attachments/attachment-service";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { currentPropertyId } from "@/lib/property";
import { LinkBodySchema } from "./schema";

export const POST = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const body = await readJson(req, LinkBodySchema);
    if (!body.ok) return body.response;
    const r = await addAttachments(await currentPropertyId(), params.id, body.data.attachmentIds, { id: auth.userId, ...requestMeta(req) });
    return r.ok ? ok({ attachments: r.attachments }) : failResponse(r);
  },
  { permission: "transaction.update" },
);
