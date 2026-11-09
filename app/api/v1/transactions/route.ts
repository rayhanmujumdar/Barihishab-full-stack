import { connection } from "next/server";
import { parse, readJson, searchParams } from "@/lib/api/body";
import { withIdempotency } from "@/lib/api/idempotency";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { can } from "@/lib/permissions";
import { currentPropertyId } from "@/lib/property";
import { createTransaction, listTransactions } from "@/lib/transactions/transaction-service";
import { CreateTxnBodySchema, ListTxnQuerySchema } from "./schema";

export const GET = withAuth(
  async (req) => {
    await connection();
    const query = parse(ListTxnQuerySchema, searchParams(req));
    if (!query.ok) return query.response;
    return ok(await listTransactions(await currentPropertyId(), query.data), { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "transaction.view" },
);

export const POST = withAuth(
  async (req, { auth }) => {
    const body = await readJson(req, CreateTxnBodySchema);
    if (!body.ok) return body.response;
    const propertyId = await currentPropertyId();
    return withIdempotency(req, propertyId, auth.userId, body.data, async (save) => {
      const r = await createTransaction(propertyId, body.data, { id: auth.userId, ...requestMeta(req) }, { canAdjust: can(auth, "transaction.adjust"), save });
      if (!r.ok) return failResponse(r);
      return ok({ transaction: r.transaction, warnings: r.warnings, periodTotals: r.periodTotals }, { status: 201 });
    });
  },
  { permission: "transaction.create" },
);
