import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { idParam, ReasonSchema, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { registry } from "../../../registry";
import { PeriodTotalsSchema, TransactionSchema } from "../../schema";

export const VoidBodySchema = z.object({ reason: ReasonSchema }).strict().meta({ id: "VoidTransactionBody" });

registry.registerPath({
  method: "post",
  path: "/transactions/{id}/void",
  tags: ["Income & expenses"],
  summary: "Void an entry in an Open month (reason required, final)",
  description: "Permission `transaction.void`. The entry stays visible with its reason and stops counting.",
  security: cookieAuth,
  request: { params: idParam, body: { content: { "application/json": { schema: VoidBodySchema } } } },
  responses: {
    200: jsonResponse("Voided", apiSuccessSchema("VoidTransactionResponse", z.object({ transaction: TransactionSchema, periodTotals: PeriodTotalsSchema }))),
    ...writeErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
    409: jsonResponse("PERIOD_CLOSED / ALREADY_VOIDED", ApiErrorSchema),
  },
});
