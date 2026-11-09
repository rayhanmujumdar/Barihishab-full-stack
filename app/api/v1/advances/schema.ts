import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { IdempotencyHeader, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { cashOutFields, LedgerEntrySchema, LedgerWarningSchema, needsReference, OwnerReasonSchema, REF_REQUIRED } from "../payouts/schema";
import { registry } from "../registry";

export const AdvanceBodySchema = z
  .object({ ...cashOutFields, reason: OwnerReasonSchema.meta({ description: "Visible to every owner" }) })
  .strict()
  .refine(needsReference, { path: ["referenceNo"], message: REF_REQUIRED })
  .meta({ id: "AdvanceBody" });

registry.registerPath({
  method: "post",
  path: "/advances",
  tags: ["Owners"],
  summary: "Record an advance to an owner",
  description:
    "Permission `advance.create`. Requires `Idempotency-Key`. Posted in the latest open month. Tagged `isSelf` when the owner is the acting user. Above the advance limit (average entitlement of the last 3 closed months) it is saved with `flagged: true` and an `ADVANCE_OVER_LIMIT` warning.",
  security: cookieAuth,
  request: { headers: IdempotencyHeader, body: { content: { "application/json": { schema: AdvanceBodySchema } } } },
  responses: {
    201: jsonResponse(
      "Recorded",
      apiSuccessSchema("AdvanceResponse", z.object({ entry: LedgerEntrySchema, balancePaisa: z.number().int(), warnings: z.array(LedgerWarningSchema) })),
    ),
    ...writeErrors,
    409: jsonResponse("NO_OPEN_PERIOD / IDEMPOTENCY_CONFLICT", ApiErrorSchema),
  },
});
