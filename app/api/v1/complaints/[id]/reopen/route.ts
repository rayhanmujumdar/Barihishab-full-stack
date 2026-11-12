import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { complaintActor } from "@/lib/complaints/actor";
import { reopenComplaint } from "@/lib/complaints/complaint-service";
import { currentPropertyId } from "@/lib/property";
import { ReopenComplaintBodySchema } from "./schema";

export const POST = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const body = await readJson(req, ReopenComplaintBodySchema);
    if (!body.ok) return body.response;
    const r = await reopenComplaint(await currentPropertyId(), params.id, body.data.comment, complaintActor(auth, req));
    return r.ok ? ok({ complaint: r.complaint }) : failResponse(r);
  },
  { permission: "complaint.view" },
);
