import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { complaintActor } from "@/lib/complaints/actor";
import { hideComment } from "@/lib/complaints/comment-service";
import { currentPropertyId } from "@/lib/property";
import { HideCommentBodySchema } from "./schema";

export const POST = withAuth<{ id: string; commentId: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id) || !isUuid(params.commentId)) return apiError("NOT_FOUND");
    const body = await readJson(req, HideCommentBodySchema);
    if (!body.ok) return body.response;
    const r = await hideComment(await currentPropertyId(), params.id, params.commentId, body.data.reason, complaintActor(auth, req));
    return r.ok ? ok({ complaint: r.complaint }) : failResponse(r);
  },
  { permission: "complaint.decide" },
);
