import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { LoanSchema } from "../../../../../payouts/schema";
import { registry } from "../../../../../registry";
import { LoanReasonSchema, LOANS_TAG } from "../../../../schema";

export const LoanReasonBodySchema = z.object({ reason: LoanReasonSchema }).strict().meta({ id: "LoanReasonBody" });

registry.registerPath({
  method: "post",
  path: "/loans/{id}/repayments/{repaymentId}/void",
  tags: [LOANS_TAG],
  summary: "Void a cash repayment or manual deduction (posts a reversal)",
  description:
    "Permission `loan.manage`. Posted in the latest open month: the outstanding goes back up; cash leaves the fund again or the owner's balance goes back up. Instalments taken at close → `409 NOT_VOIDABLE` (reopen that month instead); twice → `409 ALREADY_VOIDED` (F8).",
  security: cookieAuth,
  request: { params: z.object({ id: z.uuid(), repaymentId: z.uuid() }), body: { content: { "application/json": { schema: LoanReasonBodySchema } } } },
  responses: {
    200: jsonResponse("Voided", apiSuccessSchema("VoidRepaymentResponse", z.object({ loan: LoanSchema, reversalId: z.uuid(), balancePaisa: z.number().int() }))),
    ...writeErrors,
    404: jsonResponse("Unknown loan or repayment", ApiErrorSchema),
    409: jsonResponse("NOT_VOIDABLE / ALREADY_VOIDED / LOAN_NOT_ACTIVE / NO_OPEN_PERIOD", ApiErrorSchema),
  },
});
