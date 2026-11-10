import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { withIdempotency } from "@/lib/api/idempotency";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { currentPropertyId } from "@/lib/property";
import { requestActor } from "@/lib/requests/actor";
import { disburseRequest } from "@/lib/requests/request-service";
import { DisburseBodySchema } from "./schema";

export const POST = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const body = await readJson(req, DisburseBodySchema);
    if (!body.ok) return body.response;
    const propertyId = await currentPropertyId();
    return withIdempotency(req, propertyId, auth.userId, { requestId: params.id, ...body.data }, async (save) => {
      const r = await disburseRequest(propertyId, params.id, body.data, requestActor(auth, req), save);
      return r.ok ? ok({ request: r.request, entry: r.entry, warnings: r.warnings }, { status: 201 }) : failResponse(r);
    });
  },
  { permission: "request.disburse" },
);
