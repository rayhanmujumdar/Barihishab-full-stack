import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { currentPropertyId } from "@/lib/property";
import { requestActor } from "@/lib/requests/actor";
import { rejectRequest } from "@/lib/requests/request-service";
import { DecisionReasonBodySchema } from "./schema";

export const POST = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const body = await readJson(req, DecisionReasonBodySchema);
    if (!body.ok) return body.response;
    const r = await rejectRequest(await currentPropertyId(), params.id, body.data.reason, requestActor(auth, req));
    return r.ok ? ok({ request: r.request }) : failResponse(r);
  },
  { permission: "request.decide" },
);
