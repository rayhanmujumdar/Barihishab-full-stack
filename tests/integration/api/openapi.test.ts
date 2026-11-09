import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/v1/openapi.json/route";

const EXPECTED: [string, string][] = [
  ["post", "/auth/login"],
  ["post", "/auth/logout"],
  ["post", "/auth/logout-all"],
  ["post", "/auth/refresh"],
  ["get", "/auth/session"],
  ["post", "/auth/forgot"],
  ["get", "/auth/reset/{token}"],
  ["post", "/auth/reset"],
  ["get", "/auth/invite/{token}"],
  ["post", "/auth/accept-invite"],
  ["get", "/me"],
  ["patch", "/me"],
  ["post", "/me/password"],
  ["get", "/me/sessions"],
  ["delete", "/me/sessions/{id}"],
  ["get", "/users"],
  ["post", "/users"],
  ["get", "/users/{id}"],
  ["patch", "/users/{id}"],
  ["put", "/users/{id}/roles"],
  ["post", "/users/{id}/deactivate"],
  ["post", "/users/{id}/reactivate"],
  ["post", "/users/{id}/resend-invite"],
  ["post", "/users/{id}/revoke-invite"],
  ["post", "/users/{id}/revoke-sessions"],
  ["get", "/audit"],
];

describe("GET /api/v1/openapi.json", () => {
  it("documents all 26 auth, me, users and audit operations", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(EXPECTED).toHaveLength(26);
    for (const [method, path] of EXPECTED) {
      expect(doc.paths[path]?.[method], `${method.toUpperCase()} ${path}`).toBeDefined();
    }
    expect(doc.components.securitySchemes).toHaveProperty("cookieAuth");
    expect(doc.components.securitySchemes).toHaveProperty("csrfHeader");
    expect(doc.components.schemas).toHaveProperty("PublicUser");
  });
});
