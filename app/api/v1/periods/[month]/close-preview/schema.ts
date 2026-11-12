import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { MonthKeySchema, readErrors } from "@/lib/api/money-schemas";
import { cookieAuthRead } from "@/lib/api/schemas";
import { ChangesSchema } from "../../../distribution/schema";
import { registry } from "../../../registry";
import { monthParam } from "../reserve/schema";

const paisa = z.number().int();

export const ClosePreviewSchema = z
  .object({
    month: MonthKeySchema,
    reopenCount: z.number().int().meta({ description: "Send back as the close version" }),
    canClose: z.boolean(),
    mustPass: z.array(z.object({ code: z.enum(["SHARES", "PREVIOUS_CLOSED", "BALANCED", "STILL_OPEN"]), ok: z.boolean(), month: MonthKeySchema.nullable().optional() })),
    warnings: z.array(
      z.object({
        code: z.enum(["NO_INCOME", "UNPAID_RENT", "MISSING_BILLS", "MONTH_NOT_OVER", "RESERVE_NEGATIVE", "OPEN_COMPLAINTS"]),
        units: z.array(z.object({ name: z.string(), tenantName: z.string().nullable() })).optional(),
        count: z.number().int().optional(),
        nextMonth: MonthKeySchema.optional(),
        reserveAfterClosePaisa: paisa.optional(),
      }),
    ),
    whatHappens: z.object({
      entitlementCount: z.number().int(),
      entitlementTotalPaisa: paisa,
      ownerCount: z.number().int(),
      deductions: z.array(z.object({ ownerId: z.uuid(), displayName: z.string(), amountPaisa: paisa })),
      skipped: z.array(z.object({ ownerId: z.uuid(), displayName: z.string() })),
      nextMonthOpens: MonthKeySchema.nullable(),
    }),
    changes: ChangesSchema.nullable(),
  })
  .meta({ id: "ClosePreview" });

registry.registerPath({
  method: "get",
  path: "/periods/{month}/close-preview",
  tags: ["Distribution"],
  summary: "Close checklist, warnings and what closing will do",
  description: "Permission `period.close` (Distribution PRD F5, F8, G1, G2; DST-02). Must-pass checks block the close; warnings don't.",
  security: cookieAuthRead,
  request: { params: monthParam },
  responses: {
    200: jsonResponse("Preview", apiSuccessSchema("ClosePreviewResponse", ClosePreviewSchema)),
    ...readErrors,
    404: jsonResponse("Unknown month", ApiErrorSchema),
    422: jsonResponse("VALIDATION_FAILED", ApiErrorSchema),
  },
});
