import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { idParam, MonthKeySchema, readErrors } from "@/lib/api/money-schemas";
import { cookieAuthRead } from "@/lib/api/schemas";
import { LedgerEntrySchema } from "../../../payouts/schema";
import { registry } from "../../../registry";

export const StatementQuerySchema = z
  .object({
    from: MonthKeySchema.optional().meta({ description: "Default: January of this year" }),
    to: z.union([MonthKeySchema, z.literal("latest")]).optional().meta({ description: "A month or `latest` (default)" }),
  })
  .refine((q) => !q.from || !q.to || q.to === "latest" || q.from <= q.to, { path: ["to"], message: "'To' must be on or after 'From'." });

export const StatementSchema = z
  .object({
    owner: z.object({ id: z.uuid(), displayName: z.string(), units: z.number().int(), sharePercent: z.number() }),
    from: MonthKeySchema,
    to: z.string(),
    broughtForwardPaisa: z.number().int(),
    rows: z.array(LedgerEntrySchema.extend({ runningPaisa: z.number().int() })),
    closingPaisa: z.number().int().meta({ description: "For `latest`, equals the owner's balance" }),
    totals: z.record(z.string(), z.number().int()).meta({ description: "Σ amount per entry type over the rows" }),
  })
  .meta({ id: "OwnerStatement" });

registry.registerPath({
  method: "get",
  path: "/owners/{id}/statement",
  tags: ["Owners"],
  summary: "Owner statement with brought forward, running balance and closing",
  description: "Permission `owner.view`. Rows by posting month; voided originals and their reversals both appear and cancel.",
  security: cookieAuthRead,
  request: { params: idParam, query: StatementQuerySchema },
  responses: {
    200: jsonResponse("Statement", apiSuccessSchema("OwnerStatementResponse", StatementSchema)),
    ...readErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
    422: jsonResponse("VALIDATION_FAILED", ApiErrorSchema),
  },
});
