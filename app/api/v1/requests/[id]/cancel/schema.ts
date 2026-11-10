import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { registry } from "../../../registry";
import { RequestSchema, REQUESTS_TAG } from "../../schema";


registry.registerPath({
  method: "post",
  path: "/requests/{id}/cancel",
  tags: [REQUESTS_TAG],
  summary: "Cancel a pending or approved request",
  description: "Permission `request.create`; only the requester, while PENDING or APPROVED. Super Admins are emailed (F3, G4).",
  security: cookieAuth,
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: jsonResponse("Done", apiSuccessSchema("CancelRequestResponse", z.object({ request: RequestSchema }))),
    ...writeErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
    409: jsonResponse("INVALID_REQUEST_STATUS", ApiErrorSchema),
  },
});
