import { connection } from "next/server";
import { parse, readJson, searchParams } from "@/lib/api/body";
import { withIdempotency } from "@/lib/api/idempotency";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { listAdvances } from "@/lib/loans/advance-service";
import { createAdvance } from "@/lib/owners/ledger-service";
import { currentPropertyId } from "@/lib/property";
import { AdvanceBodySchema, ListAdvancesQuerySchema } from "./schema";

export const GET = withAuth(
  async (req) => {
    await connection();
    const query = parse(ListAdvancesQuerySchema, searchParams(req));
    if (!query.ok) return query.response;
    return ok(await listAdvances(await currentPropertyId(), query.data), { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "loan.view" },
);

export const POST = withAuth(
  async (req, { auth }) => {
    const body = await readJson(req, AdvanceBodySchema);
    if (!body.ok) return body.response;
    const propertyId = await currentPropertyId();
    return withIdempotency(req, propertyId, auth.userId, body.data, async (save) => {
      const r = await createAdvance(propertyId, body.data, { id: auth.userId, ...requestMeta(req) }, save);
      return r.ok ? ok({ entry: r.entry, balancePaisa: r.balancePaisa, warnings: r.warnings }, { status: 201 }) : failResponse(r);
    });
  },
  { permission: "advance.create" },
);
