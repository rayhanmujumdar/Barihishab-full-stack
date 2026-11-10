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
  path: "/loans/{id}/write-off",
  tags: [LOANS_TAG],
  summary: "Write off a loan as a house expense shared by all owners",
  description: "Permission `loan.manage`. ACTIVE loans only. Books the outstanding as a `LOAN_WRITTEN_OFF` expense in the latest open month (locked from Entries) and sets WRITTEN_OFF; no fund balance changes (F10).",
  security: cookieAuth,
  request: { params: z.object({ id: z.uuid() }), body: { content: { "application/json": { schema: LoanReasonBodySchema } } } },
  responses: {
    200: jsonResponse("Done", apiSuccessSchema("WriteOffLoanResponse", z.object({ loan: LoanSchema, transactionId: z.uuid().nullable() }))),
    ...writeErrors,
    404: jsonResponse("Unknown loan", ApiErrorSchema),
    409: jsonResponse("LOAN_NOT_ACTIVE / LOAN_HAS_REPAYMENTS / NO_OPEN_PERIOD", ApiErrorSchema),
  },
});
