import { connection } from "next/server";
import { parse, readJson, searchParams } from "@/lib/api/body";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { currentPropertyId } from "@/lib/property";
import { requestActor, requestViewer } from "@/lib/requests/actor";
import { listRequests } from "@/lib/requests/request-read";
import { submitRequest } from "@/lib/requests/request-service";
import { ListRequestsQuerySchema, SubmitRequestBodySchema } from "./schema";

export const GET = withAuth(
  async (req, { auth }) => {
    await connection();
    const query = parse(ListRequestsQuerySchema, searchParams(req));
    if (!query.ok) return query.response;
    return ok(await listRequests(await currentPropertyId(), requestViewer(auth), query.data), { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "request.view" },
);

export const POST = withAuth(
  async (req, { auth }) => {
    const body = await readJson(req, SubmitRequestBodySchema);
    if (!body.ok) return body.response;
    const r = await submitRequest(await currentPropertyId(), body.data, requestActor(auth, req));
    return r.ok ? ok({ request: r.request, warnings: r.warnings }, { status: 201 }) : failResponse(r);
  },
  { permission: "request.create" },
);
