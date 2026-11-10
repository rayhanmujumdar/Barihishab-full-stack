import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { cancelLoan } from "@/lib/loans/repayment-service";
import { currentPropertyId } from "@/lib/property";
import { LoanReasonBodySchema } from "./schema";

export const POST = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const body = await readJson(req, LoanReasonBodySchema);
    if (!body.ok) return body.response;
    const r = await cancelLoan(await currentPropertyId(), params.id, body.data.reason, { id: auth.userId, ...requestMeta(req) });
    return r.ok ? ok({ loan: r.loan, transactionId: r.transactionId }) : failResponse(r);
  },
  { permission: "loan.manage" },
);
