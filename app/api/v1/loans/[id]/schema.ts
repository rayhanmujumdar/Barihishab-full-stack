import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { LoanSchema, PositiveAmountSchema } from "../../payouts/schema";
import { registry } from "../../registry";

export const PatchLoanBodySchema = z
  .object({ installmentPaisa: PositiveAmountSchema.nullable().meta({ description: "Monthly instalment deducted on month close; null clears it" }) })
  .strict()
  .meta({ id: "PatchLoanBody" });

registry.registerPath({
  method: "patch",
  path: "/loans/{id}",
  tags: ["Owners"],
  summary: "Set or clear a loan's monthly instalment",
  description:
    "Permission `loan.manage`. Only ACTIVE loans (`409 LOAN_NOT_ACTIVE`); the instalment can't exceed the outstanding (`422`). Applies from the next month close (Distribution PRD F11).",
  security: cookieAuth,
  request: { params: z.object({ id: z.uuid() }), body: { content: { "application/json": { schema: PatchLoanBodySchema } } } },
  responses: {
    200: jsonResponse("Updated", apiSuccessSchema("LoanResponse", z.object({ loan: LoanSchema }))),
    ...writeErrors,
    404: jsonResponse("Unknown loan", ApiErrorSchema),
    409: jsonResponse("LOAN_NOT_ACTIVE", ApiErrorSchema),
  },
});
