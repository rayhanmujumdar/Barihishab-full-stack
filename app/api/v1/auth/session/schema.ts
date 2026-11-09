import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { cookieAuthRead, SessionPayloadSchema } from "@/lib/api/schemas";
import { registry } from "../../registry";

registry.registerPath({
  method: "get",
  path: "/auth/session",
  tags: ["Auth"],
  summary: "Current user, roles, permissions and CSRF token",
  security: cookieAuthRead,
  responses: {
    200: jsonResponse("Authenticated", apiSuccessSchema("SessionResponse", SessionPayloadSchema)),
    401: jsonResponse("UNAUTHENTICATED", ApiErrorSchema),
  },
});
