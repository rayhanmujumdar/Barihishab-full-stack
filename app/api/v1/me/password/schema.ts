import { z } from "zod";
import { ApiErrorSchema, jsonResponse } from "@/lib/api/openapi";
import { cookieAuth } from "@/lib/api/schemas";
import { registry } from "../../registry";

export const ChangePasswordBodySchema = z
  .object({ currentPassword: z.string().min(1, "Enter your current password").max(1024), newPassword: z.string().max(1024) })
  .meta({ id: "ChangePasswordBody" });

registry.registerPath({
  method: "post",
  path: "/me/password",
  tags: ["Me"],
  summary: "Change my password",
  description: "Needs the current password (wrong attempts count toward the lock). Ends every other session and emails 'password changed'.",
  security: cookieAuth,
  request: { body: { content: { "application/json": { schema: ChangePasswordBodySchema } } } },
  responses: {
    204: { description: "Changed; this device gets fresh cookies" },
    401: jsonResponse("INVALID_CREDENTIALS (wrong current password) / UNAUTHENTICATED", ApiErrorSchema),
    403: jsonResponse("FORBIDDEN / CSRF_INVALID", ApiErrorSchema),
    422: jsonResponse("VALIDATION_FAILED (password policy)", ApiErrorSchema),
    423: jsonResponse("ACCOUNT_LOCKED", ApiErrorSchema),
  },
});
