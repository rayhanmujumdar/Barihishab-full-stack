import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { registry } from "../../registry";

export const ForgotBodySchema = z.object({ email: z.email("Enter a valid email").max(254) }).meta({ id: "ForgotBody" });
export const ForgotResultSchema = z.object({ message: z.string() }).meta({ id: "ForgotResult" });

export const FORGOT_MESSAGE = "If that email has an account, a link is on its way.";

registry.registerPath({
  method: "post",
  path: "/auth/forgot",
  tags: ["Auth"],
  summary: "Request a password-reset link",
  description: "Always 202 with the same body, whether or not the email has an account (no enumeration). Max 3 emails per account per hour.",
  request: { body: { content: { "application/json": { schema: ForgotBodySchema } } } },
  responses: {
    202: jsonResponse("Accepted", apiSuccessSchema("ForgotResponse", ForgotResultSchema)),
    403: jsonResponse("CSRF_INVALID (foreign Origin)", ApiErrorSchema),
    422: jsonResponse("VALIDATION_FAILED (malformed email)", ApiErrorSchema),
    429: jsonResponse("RATE_LIMITED", ApiErrorSchema),
  },
});
