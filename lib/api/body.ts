// Parses and validates a JSON body: malformed JSON or schema failures become
// 422 VALIDATION_FAILED with details.fields.
import type { z, ZodType } from "zod";
import { apiError, validationError } from "./errors";

export type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

const MAX_BODY_BYTES = 64 * 1024;

export async function readJson<S extends ZodType>(req: Request, schema: S): Promise<Parsed<z.infer<S>>> {
  let raw: unknown = {};
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return { ok: false, response: apiError("VALIDATION_FAILED", { details: { fields: { _: "Body too large" } } }) };
  }
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) {
    return { ok: false, response: apiError("VALIDATION_FAILED", { details: { fields: { _: "Body too large" } } }) };
  }
  if (text) {
    try {
      raw = JSON.parse(text);
    } catch {
      return { ok: false, response: apiError("VALIDATION_FAILED", { details: { fields: { _: "Body must be valid JSON" } } }) };
    }
  }
  return parse(schema, raw);
}

export function parse<S extends ZodType>(schema: S, raw: unknown): Parsed<z.infer<S>> {
  const result = schema.safeParse(raw);
  if (!result.success) return { ok: false, response: validationError(result.error) };
  return { ok: true, data: result.data };
}

export function searchParams(req: Request): Record<string, string> {
  return Object.fromEntries(new URL(req.url).searchParams.entries());
}
