import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { DistributionSchema } from "../../../distribution/schema";
import { OwnerReasonSchema } from "../../../payouts/schema";
import { registry } from "../../../registry";
import { monthParam } from "../reserve/schema";

export const ReopenBodySchema = z.object({ reason: OwnerReasonSchema }).strict().meta({ id: "ReopenMonthBody" });

registry.registerPath({
  method: "post",
  path: "/periods/{month}/reopen",
  tags: ["Distribution"],
  summary: "Reopen the latest closed month",
  description:
    "Permission `period.reopen` (Distribution PRD F7; DST-04). Only the latest closed month (`409 REOPEN_NOT_ALLOWED` otherwise). Every entitlement and loan deduction of the month is voided with a REVERSAL; repaid loans become active again; payouts made after the close stay.",
  security: cookieAuth,
  request: { params: monthParam, body: { content: { "application/json": { schema: ReopenBodySchema } } } },
  responses: {
    200: jsonResponse("Reopened — the month's board", apiSuccessSchema("ReopenMonthResponse", DistributionSchema)),
    ...writeErrors,
    404: jsonResponse("Unknown month", ApiErrorSchema),
    409: jsonResponse("REOPEN_NOT_ALLOWED", ApiErrorSchema),
  },
});
