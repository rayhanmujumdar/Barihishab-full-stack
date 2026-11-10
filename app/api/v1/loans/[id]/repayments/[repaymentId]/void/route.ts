import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { voidRepayment } from "@/lib/loans/repayment-service";
import { currentPropertyId } from "@/lib/property";
import { LoanReasonBodySchema } from "./schema";

export const POST = withAuth<{ id: string; repaymentId: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id) || !isUuid(params.repaymentId)) return apiError("NOT_FOUND");
    const body = await readJson(req, LoanReasonBodySchema);
    if (!body.ok) return body.response;
    const r = await voidRepayment(await currentPropertyId(), params.id, params.repaymentId, body.data.reason, { id: auth.userId, ...requestMeta(req) });
    return r.ok ? ok({ loan: r.loan, reversalId: r.reversalId, balancePaisa: r.balancePaisa }) : failResponse(r);
  },
  { permission: "loan.manage" },
);
