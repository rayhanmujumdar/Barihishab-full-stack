import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { SessionPayloadSchema } from "@/lib/api/schemas";
import { registry } from "../../registry";

export const LoginBodySchema = z
  .object({
    identifier: z.string().trim().min(1, "Enter your username or email").max(254),
    password: z.string().min(1, "Enter your password").max(1024),
    remember: z.boolean().default(false),
  })
  .meta({ id: "LoginBody" });

registry.registerPath({
  method: "post",
  path: "/auth/login",
  tags: ["Auth"],
  summary: "Log in with username or email + password",
  description:
    "Case-insensitive identifier. Sets `bh_at` (JWT, 15 min), `bh_rt` (refresh; 30 days with remember, else browser-session) and `bh_csrf` cookies. Failures are generic; 5 wrong passwords lock the account for 15 minutes.",
  request: { body: { content: { "application/json": { schema: LoginBodySchema } } } },
  responses: {
    200: jsonResponse("Logged in", apiSuccessSchema("LoginResponse", SessionPayloadSchema)),
    401: jsonResponse("INVALID_CREDENTIALS (details.attemptsLeft after the 3rd failure)", ApiErrorSchema),
    403: jsonResponse("CSRF_INVALID (foreign Origin)", ApiErrorSchema),
    422: jsonResponse("VALIDATION_FAILED", ApiErrorSchema),
    423: jsonResponse("ACCOUNT_LOCKED (details.retryAfter seconds)", ApiErrorSchema),
    429: jsonResponse("RATE_LIMITED (Retry-After header)", ApiErrorSchema),
  },
});
