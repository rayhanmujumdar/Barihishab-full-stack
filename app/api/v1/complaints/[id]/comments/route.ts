import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { complaintActor } from "@/lib/complaints/actor";
import { addComment } from "@/lib/complaints/comment-service";
import { currentPropertyId } from "@/lib/property";
import { AddCommentBodySchema } from "./schema";

export const POST = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const body = await readJson(req, AddCommentBodySchema);
    if (!body.ok) return body.response;
    const r = await addComment(await currentPropertyId(), params.id, body.data, complaintActor(auth, req));
    return r.ok ? ok({ complaint: r.complaint }, { status: 201 }) : failResponse(r);
  },
  { permission: "complaint.view" },
);
