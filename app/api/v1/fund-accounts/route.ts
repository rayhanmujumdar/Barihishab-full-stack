import { connection } from "next/server";
import { parse, readJson, searchParams } from "@/lib/api/body";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { createFund, listFunds } from "@/lib/master-data/fund-service";
import { currentPropertyId } from "@/lib/property";
import { CreateFundBodySchema, ListFundsQuerySchema } from "./schema";

export const GET = withAuth(
  async (req) => {
    await connection();
    const query = parse(ListFundsQuerySchema, searchParams(req));
    if (!query.ok) return query.response;
    return ok({ items: await listFunds(await currentPropertyId(), query.data) }, { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "transaction.view" },
);

export const POST = withAuth(
  async (req, { auth }) => {
    const body = await readJson(req, CreateFundBodySchema);
    if (!body.ok) return body.response;
    const r = await createFund(await currentPropertyId(), body.data, { id: auth.userId, ...requestMeta(req) });
    return r.ok ? ok({ fundAccount: r.fundAccount }, { status: 201 }) : failResponse(r);
  },
  { permission: "fund.manage" },
);
