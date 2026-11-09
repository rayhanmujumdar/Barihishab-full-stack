import { ApiErrorSchema, jsonResponse } from "@/lib/api/openapi";
import { cookieAuth } from "@/lib/api/schemas";
import { registry } from "../../registry";

registry.registerPath({
  method: "post",
  path: "/auth/logout-all",
  tags: ["Auth"],
  summary: "Log out from all devices",
  security: cookieAuth,
  responses: {
    204: { description: "Every session of the user revoked; cookies cleared" },
    401: jsonResponse("UNAUTHENTICATED", ApiErrorSchema),
    403: jsonResponse("CSRF_INVALID", ApiErrorSchema),
  },
});
