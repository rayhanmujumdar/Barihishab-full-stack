import { z } from "zod";
import { apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { KindSchema, MonthKeySchema, readErrors } from "@/lib/api/money-schemas";
import { cookieAuthRead } from "@/lib/api/schemas";
import { registry } from "../../registry";
import { PeriodTotalsSchema } from "../schema";

export const SummaryQuerySchema = z.object({ period: MonthKeySchema });

export const SummarySchema = z
  .object({
    period: MonthKeySchema,
    status: z.enum(["OPEN", "CLOSED"]).nullable(),
    totals: PeriodTotalsSchema,
    categories: z.array(
      z.object({
        id: z.uuid(),
        kind: KindSchema,
        code: z.string(),
        nameEn: z.string(),
        nameBn: z.string(),
        count: z.number().int().meta({ description: "Entries incl. voided" }),
        totalPaisa: z.number().int().meta({ description: "Non-voided only" }),
      }),
    ),
  })
  .meta({ id: "TransactionSummary" });

registry.registerPath({
  method: "get",
  path: "/transactions/summary",
  tags: ["Income & expenses"],
  summary: "Month totals, tab counts and the category chips in use",
  description: "Permission `transaction.view`.",
  security: cookieAuthRead,
  request: { query: SummaryQuerySchema },
  responses: { 200: jsonResponse("Summary", apiSuccessSchema("TransactionSummaryResponse", SummarySchema)), ...readErrors },
});
