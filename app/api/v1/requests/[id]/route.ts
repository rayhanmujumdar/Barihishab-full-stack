import { connection } from "next/server";
import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { currentPropertyId } from "@/lib/property";
import { requestActor, requestViewer } from "@/lib/requests/actor";
import { requestDetail } from "@/lib/requests/request-read";
import { editRequest } from "@/lib/requests/request-service";
import { EditRequestBodySchema } from "./schema";

export const GET = withAuth<{ id: string }>(
  async (_req, { auth, params }) => {
    await connection();
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const detail = await requestDetail(await currentPropertyId(), params.id, requestViewer(auth));
    return detail ? ok(detail, { headers: { "Cache-Control": "no-store" } }) : apiError("NOT_FOUND");
  },
  { permission: "request.view" },
);

export const PATCH = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const body = await readJson(req, EditRequestBodySchema);
    if (!body.ok) return body.response;
    const r = await editRequest(await currentPropertyId(), params.id, body.data, requestActor(auth, req));
    return r.ok ? ok({ request: r.request, warnings: r.warnings }) : failResponse(r);
  },
  { permission: "request.create" },
);
