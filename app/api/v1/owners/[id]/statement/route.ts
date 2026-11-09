import { connection } from "next/server";
import { parse, searchParams } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { todayIsoInDhaka } from "@/lib/clock";
import { ownerStatement } from "@/lib/owners/ledger-service";
import { getOwnerItem } from "@/lib/owners/owner-service";
import { currentPropertyId } from "@/lib/property";
import { StatementQuerySchema } from "./schema";

export const GET = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    await connection();
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const query = parse(StatementQuerySchema, searchParams(req));
    if (!query.ok) return query.response;
    const propertyId = await currentPropertyId();
    const owner = await getOwnerItem(propertyId, params.id, auth.userId);
    if (!owner) return apiError("NOT_FOUND");
    const from = query.data.from ?? `${todayIsoInDhaka().slice(0, 4)}-01`;
    const data = await ownerStatement(propertyId, owner, from, query.data.to ?? "latest");
    return ok(data, { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "owner.view" },
);
