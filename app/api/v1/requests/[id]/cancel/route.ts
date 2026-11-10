import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { currentPropertyId } from "@/lib/property";
import { requestActor } from "@/lib/requests/actor";
import { cancelRequest } from "@/lib/requests/request-service";

export const POST = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const r = await cancelRequest(await currentPropertyId(), params.id, requestActor(auth, req));
    return r.ok ? ok({ request: r.request }) : failResponse(r);
  },
  { permission: "request.create" },
);
