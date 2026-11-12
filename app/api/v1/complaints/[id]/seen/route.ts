import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { complaintViewer } from "@/lib/complaints/actor";
import { markSeen } from "@/lib/complaints/seen";
import { currentPropertyId } from "@/lib/property";

export const POST = withAuth<{ id: string }>(
  async (_req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const r = await markSeen(await currentPropertyId(), params.id, complaintViewer(auth, "en"));
    return r.ok ? ok({}) : failResponse(r);
  },
  { permission: "complaint.view" },
);
