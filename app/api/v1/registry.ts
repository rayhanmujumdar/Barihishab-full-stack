// Not a route: colocated helper. Every v1 module registers its paths here
// from its own schema.ts; app/api/v1/openapi.ts turns them into the spec.
import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";

export const registry = new OpenAPIRegistry();
