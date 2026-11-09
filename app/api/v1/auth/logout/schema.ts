import { ApiErrorSchema, jsonResponse } from "@/lib/api/openapi";
import { cookieAuth } from "@/lib/api/schemas";
import { registry } from "../../registry";

registry.registerPath({
  method: "post",
  path: "/auth/logout",
  tags: ["Auth"],
  summary: "End the current session",
  description: "Works with a valid access token (+ CSRF) or, if it expired, with just the refresh cookie (Origin-checked).",
  security: cookieAuth,
  responses: {
    204: { description: "Logged out; cookies cleared" },
    403: jsonResponse("CSRF_INVALID", ApiErrorSchema),
  },
});
