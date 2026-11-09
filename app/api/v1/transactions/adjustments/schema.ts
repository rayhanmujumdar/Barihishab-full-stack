import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { IdempotencyHeader, KindSchema, MonthKeySchema, ReasonSchema, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { registry } from "../../registry";
import { entryFields, WriteResultSchema } from "../schema";

export const AdjustmentBodySchema = z
  .object({
    period: entryFields.period,
    kind: KindSchema,
    amountPaisa: entryFields.amountPaisa,
    txnDate: entryFields.txnDate,
    fundAccountId: entryFields.fundAccountId,
    vendor: entryFields.vendor,
    description: entryFields.description,
    fromReserve: entryFields.fromReserve,
    referencePeriod: MonthKeySchema,
    reason: ReasonSchema,
  })
  .strict()
  .meta({ id: "AdjustmentBody" });

registry.registerPath({
  method: "post",
  path: "/transactions/adjustments",
  tags: ["Income & expenses"],
  summary: "Record an Adjustment in an Open month for an older Closed month",
  description: "Permission `transaction.adjust`. Requires `Idempotency-Key`. Category ADJUSTMENT_INC/EXP is chosen by kind.",
  security: cookieAuth,
  request: { headers: IdempotencyHeader, body: { content: { "application/json": { schema: AdjustmentBodySchema } } } },
  responses: {
    201: jsonResponse("Created", apiSuccessSchema("AdjustmentResponse", WriteResultSchema)),
    ...writeErrors,
    409: jsonResponse("PERIOD_CLOSED / IDEMPOTENCY_CONFLICT", ApiErrorSchema),
  },
});
