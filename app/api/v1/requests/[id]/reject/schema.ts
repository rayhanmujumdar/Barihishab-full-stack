import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { registry } from "../../../registry";
import { RequestSchema, REQUESTS_TAG, DecisionReasonSchema } from "../../schema";

export const DecisionReasonBodySchema = z.object({ reason: DecisionReasonSchema }).strict().meta({ id: "RequestReasonBody" });

registry.registerPath({
  method: "post",
  path: "/requests/{id}/reject",
  tags: [REQUESTS_TAG],
  summary: "Reject a pending request with a reason",
  description: "Permission `request.decide`. PENDING only; `reason` required and shown to the requester, who is emailed (F6).",
  security: cookieAuth,
  request: { params: z.object({ id: z.uuid() }), body: { content: { "application/json": { schema: DecisionReasonBodySchema } } } },
  responses: {
    200: jsonResponse("Done", apiSuccessSchema("RejectRequestResponse", z.object({ request: RequestSchema }))),
    ...writeErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
    409: jsonResponse("INVALID_REQUEST_STATUS", ApiErrorSchema),
  },
});
