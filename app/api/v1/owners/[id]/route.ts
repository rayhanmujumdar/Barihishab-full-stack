import { connection } from "next/server";
import { parse, readJson, searchParams } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { todayIsoInDhaka } from "@/lib/clock";
import { getOwnerDetail, updateOwner } from "@/lib/owners/owner-service";
import { currentPropertyId } from "@/lib/property";
import { OwnerDetailQuerySchema, PatchOwnerBodySchema } from "./schema";

export const GET = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    await connection();
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const query = parse(OwnerDetailQuerySchema, searchParams(req));
    if (!query.ok) return query.response;
    const year = query.data.year ?? Number(todayIsoInDhaka().slice(0, 4));
    const owner = await getOwnerDetail(await currentPropertyId(), params.id, auth.userId, year);
    return owner ? ok({ owner }, { headers: { "Cache-Control": "no-store" } }) : apiError("NOT_FOUND");
  },
  { permission: "owner.view" },
);

export const PATCH = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const body = await readJson(req, PatchOwnerBodySchema);
    if (!body.ok) return body.response;
    const r = await updateOwner(await currentPropertyId(), params.id, body.data, { id: auth.userId, ...requestMeta(req) });
    return r.ok ? ok({ owner: r.owner }) : failResponse(r);
  },
  { permission: "owner.manage" },
);
