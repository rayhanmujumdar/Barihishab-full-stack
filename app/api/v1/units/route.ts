import { connection } from "next/server";
import { parse, readJson, searchParams } from "@/lib/api/body";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { createUnit, listUnits } from "@/lib/master-data/unit-service";
import { currentPropertyId } from "@/lib/property";
import { CreateUnitBodySchema, ListUnitsQuerySchema } from "./schema";

export const GET = withAuth(
  async (req) => {
    await connection();
    const query = parse(ListUnitsQuerySchema, searchParams(req));
    if (!query.ok) return query.response;
    return ok({ items: await listUnits(await currentPropertyId(), query.data) }, { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "transaction.view" },
);

export const POST = withAuth(
  async (req, { auth }) => {
    const body = await readJson(req, CreateUnitBodySchema);
    if (!body.ok) return body.response;
    const r = await createUnit(await currentPropertyId(), body.data, { id: auth.userId, ...requestMeta(req) });
    return r.ok ? ok({ unit: r.unit }, { status: 201 }) : failResponse(r);
  },
  { permission: "unit.manage" },
);
