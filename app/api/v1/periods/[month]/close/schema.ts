import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { DistributionSchema } from "../../../distribution/schema";
import { registry } from "../../../registry";
import { monthParam } from "../reserve/schema";

export const CloseBodySchema = z
  .object({ reopenCount: z.number().int().min(0).meta({ description: "The `reopenCount` the close preview showed (stale → 409 PERIOD_CHANGED)" }) })
  .strict()
  .meta({ id: "CloseMonthBody" });

registry.registerPath({
  method: "post",
  path: "/periods/{month}/close",
  tags: ["Distribution"],
  summary: "Close and lock a month",
  description:
    "Permission `period.close` (Distribution PRD F5, F6, F11; DST-03). One transaction: one ENTITLEMENT per owner with units (dated the last day), loan instalments, the snapshot, CLOSED status (locks income, expenses and the owner ledger), the next month opened. Months close in order (`PREVIOUS_MONTH_OPEN`); a failed must-pass check is `CLOSE_BLOCKED` with `details.failed`; a second close is `PERIOD_ALREADY_CLOSED` with `details.closedBy`.",
  security: cookieAuth,
  request: { params: monthParam, body: { content: { "application/json": { schema: CloseBodySchema } } } },
  responses: {
    200: jsonResponse("Closed — the month's board", apiSuccessSchema("CloseMonthResponse", DistributionSchema)),
    ...writeErrors,
    404: jsonResponse("Unknown month", ApiErrorSchema),
    409: jsonResponse("PERIOD_ALREADY_CLOSED / PERIOD_CHANGED / PREVIOUS_MONTH_OPEN / CLOSE_BLOCKED", ApiErrorSchema),
  },
});
