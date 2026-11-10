import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { IdempotencyHeader, IsoDateSchema, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { needsReference, PayMethodSchema, PositiveAmountSchema, REF_REQUIRED } from "../../../payouts/schema";
import { registry } from "../../../registry";
import { RequestSchema, RequestWarningSchema, REQUESTS_TAG } from "../../schema";

export const DisburseBodySchema = z
  .object({
    date: IsoDateSchema,
    fundAccountId: z.uuid("Pick a fund account."),
    method: PayMethodSchema,
    referenceNo: z.string().trim().max(60, "At most 60 characters").nullable().optional(),
    installmentPaisa: PositiveAmountSchema.nullable().optional().meta({ description: "Loans only: monthly instalment (≤ the approved amount); null = Manual" }),
  })
  .strict()
  .refine(needsReference, { path: ["referenceNo"], message: REF_REQUIRED })
  .meta({ id: "DisburseRequestBody" });

registry.registerPath({
  method: "post",
  path: "/requests/{id}/disburse",
  tags: [REQUESTS_TAG],
  summary: "Pay out an approved request",
  description:
    "Permission `request.disburse`. Requires `Idempotency-Key`. APPROVED only, in the latest open month (`409 NO_OPEN_PERIOD`). Creates exactly one linked entry for the approved amount in the same transaction — ADVANCE on the owner's statement, a new loan L{n}, or an `OWNER_GRANT` expense with the owner as beneficiary — marks the request DISBURSED and emails every owner. All or nothing; never twice (F7, Rule 7).",
  security: cookieAuth,
  request: { params: z.object({ id: z.uuid() }), headers: IdempotencyHeader, body: { content: { "application/json": { schema: DisburseBodySchema } } } },
  responses: {
    201: jsonResponse(
      "Disbursed",
      apiSuccessSchema(
        "DisburseRequestResponse",
        z.object({ request: RequestSchema, entry: z.object({ kind: z.enum(["ADVANCE", "LOAN", "EXPENSE"]), id: z.uuid() }), warnings: z.array(RequestWarningSchema) }),
      ),
    ),
    ...writeErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
    409: jsonResponse("INVALID_REQUEST_STATUS / NO_OPEN_PERIOD / IDEMPOTENCY_CONFLICT", ApiErrorSchema),
  },
});
