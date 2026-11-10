import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { LoanSchema } from "../../../payouts/schema";
import { registry } from "../../../registry";
import { LoanReasonBodySchema } from "../repayments/[repaymentId]/void/schema";
import { LOANS_TAG } from "../../schema";

export { LoanReasonBodySchema };

registry.registerPath({
  method: "post",
  path: "/loans/{id}/cancel",
  tags: [LOANS_TAG],
  summary: "Cancel a loan that has no repayments",
  description: "Permission `loan.manage`. Only ACTIVE loans with no non-voided repayments (`409 LOAN_HAS_REPAYMENTS`). Returns the principal to the fund; status CANCELLED; the loan stays visible (F9).",
  security: cookieAuth,
  request: { params: z.object({ id: z.uuid() }), body: { content: { "application/json": { schema: LoanReasonBodySchema } } } },
  responses: {
    200: jsonResponse("Done", apiSuccessSchema("CancelLoanResponse", z.object({ loan: LoanSchema, transactionId: z.uuid().nullable() }))),
    ...writeErrors,
    404: jsonResponse("Unknown loan", ApiErrorSchema),
    409: jsonResponse("LOAN_NOT_ACTIVE / LOAN_HAS_REPAYMENTS / NO_OPEN_PERIOD", ApiErrorSchema),
  },
});
