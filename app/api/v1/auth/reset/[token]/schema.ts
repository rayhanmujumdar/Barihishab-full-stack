import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { registry } from "../../../registry";

registry.registerPath({
  method: "get",
  path: "/auth/reset/{token}",
  tags: ["Auth"],
  summary: "Check a password-reset link",
  request: { params: z.object({ token: z.string() }) },
  responses: {
    200: jsonResponse("Valid", apiSuccessSchema("ResetCheckResponse", z.object({ valid: z.literal(true) }))),
    410: jsonResponse("TOKEN_EXPIRED / TOKEN_USED", ApiErrorSchema),
    429: jsonResponse("RATE_LIMITED", ApiErrorSchema),
  },
});
