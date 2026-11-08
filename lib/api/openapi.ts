// Zod mirrors of the response envelope in lib/api/response.ts, for OpenAPI.
// Schemas use zod 4's native `.meta({ id })`, which zod-to-openapi turns into
// a reusable entry under components/schemas.
import { z, type ZodType } from "zod";

export const ApiErrorSchema = z
  .object({
    success: z.literal(false),
    error: z.object({
      code: z.string().meta({ example: "NOT_FOUND" }),
      message: z.string().meta({ example: "Resource not found" }),
      details: z.unknown().optional(),
    }),
  })
  .meta({ id: "ApiError" });

// Wraps a data schema in the success envelope. `id` must be unique across
// the spec, e.g. "HealthResponse".
export function apiSuccessSchema<T extends ZodType>(id: string, data: T) {
  return z.object({ success: z.literal(true), data }).meta({ id });
}

// Shorthand for a registerPath response entry with a JSON body.
export function jsonResponse(description: string, schema: ZodType) {
  return { description, content: { "application/json": { schema } } };
}
