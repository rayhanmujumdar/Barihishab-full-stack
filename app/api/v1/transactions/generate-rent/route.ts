import { readJson } from "@/lib/api/body";
import { withIdempotency } from "@/lib/api/idempotency";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { currentPropertyId } from "@/lib/property";
import { generateRent } from "@/lib/transactions/transaction-service";
import { GenerateBodySchema } from "./schema";

export const POST = withAuth(
  async (req, { auth }) => {
    const body = await readJson(req, GenerateBodySchema);
    if (!body.ok) return body.response;
    const propertyId = await currentPropertyId();
    return withIdempotency(req, propertyId, auth.userId, body.data, async (save) => {
      const r = await generateRent(propertyId, body.data, { id: auth.userId, ...requestMeta(req) }, save);
      if (!r.ok) return failResponse(r);
      return ok({ created: r.created, transactions: r.transactions, skipped: r.skipped, periodTotals: r.periodTotals }, { status: 201 });
    });
  },
  { permission: "transaction.create" },
);
