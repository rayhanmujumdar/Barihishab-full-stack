import { z } from "zod";
import { ApiErrorSchema, jsonResponse } from "@/lib/api/openapi";
import { registry } from "../../registry";

export const ResetBodySchema = z
  .object({ token: z.string().min(1).max(256), password: z.string().max(1024) })
  .meta({ id: "ResetBody" });

registry.registerPath({
  method: "post",
  path: "/auth/reset",
  tags: ["Auth"],
  summary: "Set a new password with a reset link",
  description: "Revokes every session of the user, clears any lock, emails 'password changed', and starts a fresh session (cookies set).",
  request: { body: { content: { "application/json": { schema: ResetBodySchema } } } },
  responses: {
    204: { description: "Password changed; new session cookies set" },
    403: jsonResponse("CSRF_INVALID (foreign Origin)", ApiErrorSchema),
    410: jsonResponse("TOKEN_EXPIRED / TOKEN_USED", ApiErrorSchema),
    422: jsonResponse("VALIDATION_FAILED (password policy)", ApiErrorSchema),
    429: jsonResponse("RATE_LIMITED", ApiErrorSchema),
  },
});
