import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { registry } from "../../registry";

export const RefreshResultSchema = z.object({ csrfToken: z.string() }).meta({ id: "RefreshResult" });

registry.registerPath({
  method: "post",
  path: "/auth/refresh",
  tags: ["Auth"],
  summary: "Rotate the refresh token and issue a new access token",
  description:
    "Uses the `bh_rt` cookie. The presented refresh token is invalidated; replaying an already-rotated token revokes every session in its family. On failure all auth cookies are cleared.",
  security: [{ refreshCookie: [] }],
  responses: {
    200: jsonResponse("New cookies set", apiSuccessSchema("RefreshResponse", RefreshResultSchema)),
    401: jsonResponse("UNAUTHENTICATED", ApiErrorSchema),
    403: jsonResponse("CSRF_INVALID (foreign Origin)", ApiErrorSchema),
  },
});

registry.registerPath({
  method: "get",
  path: "/auth/refresh",
  tags: ["Auth"],
  summary: "Page-navigation refresh (used by the proxy)",
  description: "Rotates like POST, then 307-redirects to the safe internal `next` path, or to `/login?next=` on failure.",
  request: { query: z.object({ next: z.string().optional() }) },
  responses: { 307: { description: "Redirect" } },
});

registry.registerComponent("securitySchemes", "refreshCookie", {
  type: "apiKey",
  in: "cookie",
  name: "bh_rt",
  description: "httpOnly refresh token cookie, set by POST /auth/login. In these docs it is filled automatically after logging in.",
});
