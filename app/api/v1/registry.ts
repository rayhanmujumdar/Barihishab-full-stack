// Not a route: colocated helper. Every v1 module registers its paths here
// from its own schema.ts; app/api/v1/openapi.ts turns them into the spec.
import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";

export const registry = new OpenAPIRegistry();

// Web clients authenticate with the httpOnly `bh_at` access-token cookie;
// every POST/PATCH/PUT/DELETE also sends the CSRF token from `bh_csrf`.
registry.registerComponent("securitySchemes", "cookieAuth", {
  type: "apiKey",
  in: "cookie",
  name: "bh_at",
  description: "JWT access token (15 min). Refreshed via POST /auth/refresh using the bh_rt cookie.",
});
registry.registerComponent("securitySchemes", "csrfHeader", {
  type: "apiKey",
  in: "header",
  name: "X-CSRF-Token",
  description: "Value of the bh_csrf cookie (or csrfToken from GET /auth/session).",
});
