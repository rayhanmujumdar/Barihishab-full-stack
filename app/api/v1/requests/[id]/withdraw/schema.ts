import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { registry } from "../../../registry";
import { RequestSchema, REQUESTS_TAG } from "../../schema";
import { DecisionReasonBodySchema } from "../reject/schema";

export { DecisionReasonBodySchema };

registry.registerPath({
  method: "post",
  path: "/requests/{id}/withdraw",
  tags: [REQUESTS_TAG],
  summary: "Withdraw an approval before payout",
  description: "Permission `request.decide`. APPROVED only; `reason` required; the requester is emailed (F8, G4).",
  security: cookieAuth,
  request: { params: z.object({ id: z.uuid() }), body: { content: { "application/json": { schema: DecisionReasonBodySchema } } } },
  responses: {
    200: jsonResponse("Done", apiSuccessSchema("WithdrawRequestResponse", z.object({ request: RequestSchema }))),
    ...writeErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
    409: jsonResponse("INVALID_REQUEST_STATUS", ApiErrorSchema),
  },
});
