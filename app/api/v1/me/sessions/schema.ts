import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { cookieAuth, cookieAuthRead } from "@/lib/api/schemas";
import { registry } from "../../registry";

export const SessionItemSchema = z
  .object({
    id: z.uuid(),
    device: z.string(),
    browser: z.string(),
    ip: z.string().nullable(),
    createdAt: z.iso.datetime(),
    lastSeenAt: z.iso.datetime(),
    current: z.boolean(),
  })
  .meta({ id: "SessionItem" });

registry.registerPath({
  method: "get",
  path: "/me/sessions",
  tags: ["Me"],
  summary: "My active sessions",
  security: cookieAuthRead,
  responses: {
    200: jsonResponse("Active sessions", apiSuccessSchema("SessionListResponse", z.array(SessionItemSchema))),
    401: jsonResponse("UNAUTHENTICATED", ApiErrorSchema),
    403: jsonResponse("FORBIDDEN", ApiErrorSchema),
  },
});

registry.registerPath({
  method: "delete",
  path: "/me/sessions/{id}",
  tags: ["Me"],
  summary: "Log out one of my sessions",
  security: cookieAuth,
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    204: { description: "Revoked (cookies cleared if it was the current session)" },
    401: jsonResponse("UNAUTHENTICATED", ApiErrorSchema),
    403: jsonResponse("FORBIDDEN / CSRF_INVALID", ApiErrorSchema),
    404: jsonResponse("NOT_FOUND (not one of your sessions)", ApiErrorSchema),
  },
});
