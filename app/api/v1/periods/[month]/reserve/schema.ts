import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { MonthKeySchema, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { OwnerReasonSchema } from "../../../payouts/schema";
import { registry } from "../../../registry";

export const monthParam = z.object({ month: MonthKeySchema });

export const ReserveOverrideBodySchema = z
  .object({
    amountPaisa: z.number({ error: "Enter an amount." }).int().min(0, "Can't be negative.").max(1_000_000_000, "At most ৳1 crore.").nullable(),
    reason: z.string().trim().max(300, "At most 300 characters").nullable().optional(),
  })
  .strict()
  .refine((b) => b.amountPaisa === null || OwnerReasonSchema.safeParse(b.reason ?? "").success, { path: ["reason"], message: "Please write a reason — everyone can see it." })
  .meta({ id: "ReserveOverrideBody", description: "`{ amountPaisa, reason }` sets this month's reserve; `{ amountPaisa: null }` goes back to the rule." });

export const ReserveOverrideResultSchema = z
  .object({ month: MonthKeySchema, overridePaisa: z.number().int().nullable(), overrideReason: z.string().nullable() })
  .meta({ id: "ReserveOverrideResult" });

registry.registerPath({
  method: "put",
  path: "/periods/{month}/reserve",
  tags: ["Distribution"],
  summary: "Override (or reset) the reserve for one open month",
  description: "Permission `reserve.override` (Distribution PRD F9, G3). The override never exceeds the month's surplus. A closed month returns `409 PERIOD_CLOSED`.",
  security: cookieAuth,
  request: { params: monthParam, body: { content: { "application/json": { schema: ReserveOverrideBodySchema } } } },
  responses: {
    200: jsonResponse("Saved", apiSuccessSchema("ReserveOverrideResponse", ReserveOverrideResultSchema)),
    ...writeErrors,
    404: jsonResponse("Unknown month", ApiErrorSchema),
    409: jsonResponse("PERIOD_CLOSED", ApiErrorSchema),
  },
});
