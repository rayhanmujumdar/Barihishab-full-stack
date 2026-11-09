import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { SessionPayloadSchema } from "@/lib/api/schemas";
import { registry } from "../../registry";

export const AcceptInviteBodySchema = z
  .object({
    token: z.string().min(1).max(256),
    password: z.string().max(1024),
    locale: z.enum(["bn", "en"]).default("bn"),
  })
  .meta({ id: "AcceptInviteBody" });

registry.registerPath({
  method: "post",
  path: "/auth/accept-invite",
  tags: ["Auth"],
  summary: "Accept an invite: set password + language, become ACTIVE, get logged in",
  request: { body: { content: { "application/json": { schema: AcceptInviteBodySchema } } } },
  responses: {
    200: jsonResponse("Account activated; auth cookies set", apiSuccessSchema("AcceptInviteResponse", SessionPayloadSchema)),
    403: jsonResponse("CSRF_INVALID (foreign Origin)", ApiErrorSchema),
    410: jsonResponse("TOKEN_EXPIRED / TOKEN_USED", ApiErrorSchema),
    422: jsonResponse("VALIDATION_FAILED (password policy)", ApiErrorSchema),
    429: jsonResponse("RATE_LIMITED", ApiErrorSchema),
  },
});
