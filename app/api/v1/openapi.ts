// Not a route: builds the v1 OpenAPI document from everything registered.
// Adding an endpoint? Create app/api/v1/<module>/schema.ts that calls
// registry.registerPath(...), then import it below — or it won't appear in Swagger.
import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { API_PREFIX } from "@/lib/api/constants";
import { registry } from "./registry";

import "./health/schema";
import "./health/db/schema";

let cached: ReturnType<OpenApiGeneratorV31["generateDocument"]> | undefined;

export function getOpenApiDocument() {
  cached ??= new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Barihishab API",
      version: "1.0.0",
      description: `All endpoints are served under \`${API_PREFIX}\`.`,
    },
    servers: [{ url: API_PREFIX }],
  });
  return cached;
}
