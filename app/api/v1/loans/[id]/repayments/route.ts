import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { withIdempotency } from "@/lib/api/idempotency";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { recordRepayment } from "@/lib/loans/repayment-service";
import { currentPropertyId } from "@/lib/property";
import { RepaymentBodySchema } from "./schema";

export const POST = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const body = await readJson(req, RepaymentBodySchema);
    if (!body.ok) return body.response;
    const propertyId = await currentPropertyId();
    return withIdempotency(req, propertyId, auth.userId, { loanId: params.id, ...body.data }, async (save) => {
      const r = await recordRepayment(propertyId, params.id, body.data, { id: auth.userId, ...requestMeta(req) }, save);
      return r.ok ? ok({ loan: r.loan, movement: r.movement, balancePaisa: r.balancePaisa }, { status: 201 }) : failResponse(r);
    });
  },
  { permission: "loan.repay" },
);
