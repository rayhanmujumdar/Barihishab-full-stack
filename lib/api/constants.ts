// Every API route lives under this prefix: app/api/v1/<module>/route.ts.
// A breaking change ships as /api/v2 alongside v1, never by editing v1 in place.
export const API_VERSION = "v1";
export const API_PREFIX = `/api/${API_VERSION}`;

// Swagger UI and the raw OpenAPI spec are public in development. In production
// they stay hidden (404) unless API_DOCS_ENABLED=true is set explicitly.
export function isApiDocsEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.API_DOCS_ENABLED === "true"
  );
}

// Diagnostic endpoints that write to the DB (e.g. POST /health/db) follow the
// same rule: open in development, 404 in production unless opted in.
export function isDiagnosticsEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.API_DIAGNOSTICS_ENABLED === "true"
  );
}
