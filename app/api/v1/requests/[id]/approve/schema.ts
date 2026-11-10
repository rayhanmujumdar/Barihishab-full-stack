import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { registry } from "../../../registry";
import { RequestSchema, REQUESTS_TAG } from "../../schema";

export const ApproveBodySchema = z
  .object({
    amountPaisa: z.number({ error: "Enter an amount." }).int("Enter an amount.").optional().meta({ description: "Approved amount in paisa; default the requested amount" }),
    note: z.string().trim().max(300, "At most 300 characters").nullable().optional().meta({ description: "Note to the requester; required when approving less" }),
  })
  .strict()
  .meta({ id: "ApproveRequestBody" });

registry.registerPath({
  method: "post",
  path: "/requests/{id}/approve",
  tags: [REQUESTS_TAG],
  summary: "Approve a request (full or lower amount)",
  description: "Permission `request.decide`. PENDING only. `amountPaisa` defaults to the requested amount and must be ৳1…requested; a lower amount needs `note`. The requester is emailed; a self-request is tagged Self-approved and every owner is emailed (F5, F10, G2, G15). Moves no money.",
  security: cookieAuth,
  request: { params: z.object({ id: z.uuid() }), body: { content: { "application/json": { schema: ApproveBodySchema } } } },
  responses: {
    200: jsonResponse("Done", apiSuccessSchema("ApproveRequestResponse", z.object({ request: RequestSchema }))),
    ...writeErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
    409: jsonResponse("INVALID_REQUEST_STATUS", ApiErrorSchema),
  },
});
