import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { IdempotencyHeader, IsoDateSchema, MonthKeySchema, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { MSG } from "@/lib/transactions/rules";
import { registry } from "../../registry";
import { AmountSchema, PeriodTotalsSchema, TransactionSchema } from "../schema";

export const PreviewBodySchema = z.object({ period: MonthKeySchema }).strict().meta({ id: "RentPreviewBody" });

export const RentRowSchema = z
  .object({ unitId: z.uuid(), unit: z.string(), tenant: z.string().nullable(), amountPaisa: z.number().int(), fundAccountId: z.uuid().nullable(), selected: z.literal(true) })
  .meta({ id: "RentDraftRow" });

export const GenerateBodySchema = z
  .object({
    period: MonthKeySchema,
    txnDate: IsoDateSchema,
    rows: z
      .array(z.object({ unitId: z.uuid(MSG.unit), amountPaisa: AmountSchema, fundAccountId: z.uuid(MSG.fund) }).strict())
      .min(1, "Tick at least one unit.")
      .max(100)
      .refine((rows) => new Set(rows.map((r) => r.unitId)).size === rows.length, "Each unit can appear once."),
  })
  .strict()
  .meta({ id: "GenerateRentBody" });

registry.registerPath({
  method: "post",
  path: "/transactions/generate-rent/preview",
  tags: ["Income & expenses"],
  summary: "Draft this month's rent (nothing is saved)",
  description: "Permission `transaction.create`. One row per active unit with no rent recorded in the month.",
  security: cookieAuth,
  request: { body: { content: { "application/json": { schema: PreviewBodySchema } } } },
  responses: {
    200: jsonResponse("Draft", apiSuccessSchema("RentPreviewResponse", z.object({ period: MonthKeySchema, rows: z.array(RentRowSchema) }))),
    ...writeErrors,
    409: jsonResponse("PERIOD_CLOSED", ApiErrorSchema),
  },
});

registry.registerPath({
  method: "post",
  path: "/transactions/generate-rent",
  tags: ["Income & expenses"],
  summary: "Save the ticked rent rows in one transaction",
  description: "Permission `transaction.create`. Requires `Idempotency-Key`. Units that got rent since the preview are returned in `skipped`.",
  security: cookieAuth,
  request: { headers: IdempotencyHeader, body: { content: { "application/json": { schema: GenerateBodySchema } } } },
  responses: {
    201: jsonResponse(
      "Saved",
      apiSuccessSchema(
        "GenerateRentResponse",
        z.object({
          created: z.number().int(),
          transactions: z.array(TransactionSchema),
          skipped: z.array(z.object({ unitId: z.uuid(), unit: z.string() })),
          periodTotals: PeriodTotalsSchema,
        }),
      ),
    ),
    ...writeErrors,
    409: jsonResponse("PERIOD_CLOSED / IDEMPOTENCY_CONFLICT", ApiErrorSchema),
  },
});
