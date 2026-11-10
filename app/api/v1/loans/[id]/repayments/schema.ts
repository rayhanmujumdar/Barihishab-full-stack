import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { IdempotencyHeader, IsoDateSchema, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { LoanSchema, PayMethodSchema, PositiveAmountSchema, REF_REQUIRED } from "../../../payouts/schema";
import { registry } from "../../../registry";
import { LOANS_TAG } from "../../schema";

export const RepaymentBodySchema = z
  .object({
    mode: z.enum(["CASH", "DEDUCTION"], { error: "Pick cash or deduction." }).meta({ description: "CASH = into the House Fund; DEDUCTION = from the owner's entitlement balance" }),
    amountPaisa: PositiveAmountSchema,
    date: IsoDateSchema,
    fundAccountId: z.uuid("Pick a fund account.").nullable().optional().meta({ description: "Required for CASH" }),
    method: PayMethodSchema.nullable().optional().meta({ description: "Required for CASH" }),
    referenceNo: z.string().trim().max(60, "At most 60 characters").nullable().optional(),
  })
  .strict()
  .superRefine((b, ctx) => {
    if (b.mode !== "CASH") return;
    if (!b.fundAccountId) ctx.addIssue({ code: "custom", path: ["fundAccountId"], message: "Pick a fund account." });
    if (!b.method) ctx.addIssue({ code: "custom", path: ["method"], message: "Pick a method." });
    else if (b.method !== "CASH" && !b.referenceNo) ctx.addIssue({ code: "custom", path: ["referenceNo"], message: REF_REQUIRED });
  })
  .meta({ id: "RepaymentBody" });

registry.registerPath({
  method: "post",
  path: "/loans/{id}/repayments",
  tags: [LOANS_TAG],
  summary: "Record a loan repayment in cash or by deduction from entitlement",
  description:
    "Permission `loan.repay`. Requires `Idempotency-Key`. Posted in the latest open month. CASH raises the fund account; DEDUCTION posts a LOAN_DEDUCTION that lowers the owner's balance. More than the outstanding → `422` (`details.outstandingPaisa`); a deduction above the owner's positive balance → `422` (`details.maxPaisa`). At ৳0 the loan becomes REPAID (F5).",
  security: cookieAuth,
  request: { params: z.object({ id: z.uuid() }), headers: IdempotencyHeader, body: { content: { "application/json": { schema: RepaymentBodySchema } } } },
  responses: {
    201: jsonResponse(
      "Recorded",
      apiSuccessSchema(
        "RepaymentResponse",
        z.object({
          loan: LoanSchema,
          movement: z.object({ id: z.uuid(), kind: z.enum(["CASH_REPAYMENT", "DEDUCTION"]), amountPaisa: z.number().int(), date: IsoDateSchema }),
          balancePaisa: z.number().int().meta({ description: "The owner's balance after the repayment" }),
        }),
      ),
    ),
    ...writeErrors,
    404: jsonResponse("Unknown loan", ApiErrorSchema),
    409: jsonResponse("LOAN_NOT_ACTIVE / NO_OPEN_PERIOD / IDEMPOTENCY_CONFLICT", ApiErrorSchema),
  },
});
