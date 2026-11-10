// Service result shape shared by the money modules: services never build
// HTTP responses; routes turn failures into the error envelope here.
import { apiError, type ErrorCode } from "./errors";

export type Fail = { ok: false; code: ErrorCode; fields?: Record<string, string>; details?: Record<string, unknown>; message?: string };
export type Result<T> = ({ ok: true } & T) | Fail;

export const failWith = (code: ErrorCode, fields?: Record<string, string>, details?: Record<string, unknown>): Fail => ({
  ok: false,
  code,
  ...(fields ? { fields } : {}),
  ...(details ? { details } : {}),
});
/** Narrows a service result (row, list, `{ ok: false }` or null) to the failure. */
export const isFail = (v: unknown): v is Fail => typeof v === "object" && v !== null && !Array.isArray(v) && (v as { ok?: unknown }).ok === false;

export const fieldFail = (field: string, message: string): Fail => failWith("VALIDATION_FAILED", { [field]: message });

export function failResponse(r: Fail): Response {
  const details = { ...r.details, ...(r.fields ? { fields: r.fields } : {}) };
  return apiError(r.code, { ...(Object.keys(details).length ? { details } : {}), ...(r.message ? { message: r.message } : {}) });
}

/** Who is acting, for audit rows. */
export type Actor = { id: string; ip?: string | null; userAgent?: string | null };
