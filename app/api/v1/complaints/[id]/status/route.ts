import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { complaintActor } from "@/lib/complaints/actor";
import { setComplaintStatus } from "@/lib/complaints/complaint-service";
import { currentPropertyId } from "@/lib/property";
import { SetComplaintStatusBodySchema } from "./schema";

export const PATCH = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const body = await readJson(req, SetComplaintStatusBodySchema);
    if (!body.ok) return body.response;
    const r = await setComplaintStatus(await currentPropertyId(), params.id, body.data, complaintActor(auth, req));
    return r.ok ? ok({ complaint: r.complaint }) : failResponse(r);
  },
  { permission: "complaint.decide" },
);
