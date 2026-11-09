import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { idParam, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { LedgerEntrySchema, OwnerReasonSchema } from "../../../payouts/schema";
import { registry } from "../../../registry";

export const VoidLedgerBodySchema = z.object({ reason: OwnerReasonSchema }).strict().meta({ id: "VoidLedgerBody" });

registry.registerPath({
  method: "post",
  path: "/ledger/{id}/void",
  tags: ["Owners"],
  summary: "Void a payout or advance (posts a reversal)",
  description:
    "Permission `ledger.void`. Marks the original Void and posts an equal-and-opposite REVERSAL in the latest open month; the owner balance and the fund account return to where they were. Only PAYOUT and ADVANCE, only once.",
  security: cookieAuth,
  request: { params: idParam, body: { content: { "application/json": { schema: VoidLedgerBodySchema } } } },
  responses: {
    200: jsonResponse(
      "Voided",
      apiSuccessSchema("VoidLedgerResponse", z.object({ entry: LedgerEntrySchema, reversal: LedgerEntrySchema, balancePaisa: z.number().int() })),
    ),
    ...writeErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
    409: jsonResponse("ALREADY_VOIDED / NOT_VOIDABLE / NO_OPEN_PERIOD", ApiErrorSchema),
  },
});
