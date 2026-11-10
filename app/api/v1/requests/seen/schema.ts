import { z } from "zod";
import { apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { registry } from "../../registry";
import { REQUESTS_TAG } from "../schema";

registry.registerPath({
  method: "post",
  path: "/requests/seen",
  tags: [REQUESTS_TAG],
  summary: "Mark decisions on my requests as seen",
  description: "Permission `request.view`. Clears the nav badge for decisions on the caller's own requests (design D11). Idempotent.",
  security: cookieAuth,
  responses: { 200: jsonResponse("Cleared", apiSuccessSchema("RequestsSeenResponse", z.object({ cleared: z.number().int() }))), ...writeErrors },
});
