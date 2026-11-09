import { connection } from "next/server";
import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { can } from "@/lib/permissions";
import { currentPropertyId } from "@/lib/property";
import { correctTransaction, getTransactionDetail } from "@/lib/transactions/transaction-service";
import { CorrectBodySchema } from "./schema";

export const GET = withAuth<{ id: string }>(
  async (_req, { params }) => {
    await connection();
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const detail = await getTransactionDetail(await currentPropertyId(), params.id);
    return detail ? ok(detail, { headers: { "Cache-Control": "no-store" } }) : apiError("NOT_FOUND");
  },
  { permission: "transaction.view" },
);

export const PATCH = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const body = await readJson(req, CorrectBodySchema);
    if (!body.ok) return body.response;
    const r = await correctTransaction(await currentPropertyId(), params.id, body.data, { id: auth.userId, ...requestMeta(req) }, { canAdjust: can(auth, "transaction.adjust") });
    if (!r.ok) return failResponse(r);
    return ok({ transaction: r.transaction, warnings: r.warnings, periodTotals: r.periodTotals });
  },
  { permission: "transaction.update" },
);
