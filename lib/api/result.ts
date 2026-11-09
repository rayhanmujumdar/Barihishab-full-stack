// Service result shape shared by the money modules: services never build
// HTTP responses; routes turn failures into the error envelope here.
import { apiError, type ErrorCode } from "./errors";

export type Fail = { ok: false; code: ErrorCode; fields?: Record<string, string> };
export type Result<T> = ({ ok: true } & T) | Fail;

export const failWith = (code: ErrorCode, fields?: Record<string, string>): Fail => ({ ok: false, code, ...(fields ? { fields } : {}) });
export const fieldFail = (field: string, message: string): Fail => failWith("VALIDATION_FAILED", { [field]: message });

export function failResponse(r: Fail): Response {
  return apiError(r.code, r.fields ? { details: { fields: r.fields } } : {});
}

/** Who is acting, for audit rows. */
export type Actor = { id: string; ip?: string | null; userAgent?: string | null };
