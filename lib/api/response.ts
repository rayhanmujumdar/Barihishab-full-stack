// One JSON envelope for every /api/v1 response, so clients branch on
// `success` instead of guessing the shape per endpoint.
//
//   success: { success: true,  data: T }
//   failure: { success: false, error: { code, message, details? } }
//
// The matching OpenAPI schemas live in lib/api/openapi.ts.

export type ApiSuccess<T> = { success: true; data: T };

export type ApiErrorBody = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiError = { success: false; error: ApiErrorBody };

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ success: true, data } satisfies ApiSuccess<T>, init);
}

export function fail(
  error: ApiErrorBody & { status: number },
  init?: Omit<ResponseInit, "status">,
): Response {
  const { status, ...body } = error;
  return Response.json({ success: false, error: body } satisfies ApiError, {
    ...init,
    status,
  });
}
