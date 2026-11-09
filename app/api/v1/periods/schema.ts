import { z } from "zod";
import { apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { MonthKeySchema, readErrors } from "@/lib/api/money-schemas";
import { cookieAuthRead } from "@/lib/api/schemas";
import { registry } from "../registry";

export const PeriodSchema = z
  .object({ id: z.uuid(), month: MonthKeySchema, status: z.enum(["OPEN", "CLOSED"]) })
  .meta({ id: "Period" });

export const PeriodListSchema = z
  .object({ items: z.array(PeriodSchema), latestOpen: MonthKeySchema.nullable() })
  .meta({ id: "PeriodList" });

registry.registerPath({
  method: "get",
  path: "/periods",
  tags: ["Periods"],
  summary: "List accounting months (opens the current month if missing)",
  description: "Permission `transaction.view`. Newest first; `latestOpen` is the default month for new entries.",
  security: cookieAuthRead,
  responses: { 200: jsonResponse("Periods", apiSuccessSchema("PeriodListResponse", PeriodListSchema)), ...readErrors },
});
