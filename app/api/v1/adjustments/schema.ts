import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { IdempotencyHeader, MonthKeySchema, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { SignedAmountSchema } from "../owners/[id]/opening/schema";
import { LedgerEntrySchema, OwnerReasonSchema } from "../payouts/schema";
import { registry } from "../registry";

export const OwnerAdjustmentBodySchema = z
  .object({ ownerId: z.uuid("Pick an owner."), amountPaisa: SignedAmountSchema, referenceMonth: MonthKeySchema, reason: OwnerReasonSchema })
  .strict()
  .meta({ id: "OwnerAdjustmentBody" });

registry.registerPath({
  method: "post",
  path: "/adjustments",
  tags: ["Owners"],
  summary: "Owner balance adjustment for an old-month correction",
  description:
    "Permission `ledger.adjust`. Requires `Idempotency-Key`. Signed amount (+ owed / − reduce) posted in the latest open month with a reference month; no House Fund effect. (Not the same as `/transactions/adjustments`, which corrects house income/expenses.)",
  security: cookieAuth,
  request: { headers: IdempotencyHeader, body: { content: { "application/json": { schema: OwnerAdjustmentBodySchema } } } },
  responses: {
    201: jsonResponse("Recorded", apiSuccessSchema("OwnerAdjustmentResponse", z.object({ entry: LedgerEntrySchema, balancePaisa: z.number().int() }))),
    ...writeErrors,
    409: jsonResponse("NO_OPEN_PERIOD / IDEMPOTENCY_CONFLICT", ApiErrorSchema),
  },
});
