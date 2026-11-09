// Shared zod + OpenAPI pieces for the Income & Expenses endpoints.
import { z } from "zod";
import { ApiErrorSchema, jsonResponse } from "./openapi";

export const MonthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM").meta({ example: "2026-10" });
export const IsoDateSchema = z.iso.date().meta({ example: "2026-10-12" });
export const KindSchema = z.enum(["INCOME", "EXPENSE"]).meta({ id: "TxnKind" });
export const PaisaSchema = z.number().int().meta({ description: "Integer paisa (৳1 = 100)", example: 630000 });
export const ReasonSchema = z
  .string()
  .trim()
  .min(5, "Write a short reason — every owner can see it.")
  .max(500, "Write a short reason — every owner can see it.");

export const idParam = z.object({ id: z.uuid() });

export const IdempotencyHeader = z.object({
  "idempotency-key": z.string().min(8).max(100).meta({ description: "Unique per create attempt; a retry with the same key replays the first response." }),
});

export const readErrors = {
  401: jsonResponse("UNAUTHENTICATED", ApiErrorSchema),
  403: jsonResponse("FORBIDDEN", ApiErrorSchema),
};
export const writeErrors = {
  401: jsonResponse("UNAUTHENTICATED", ApiErrorSchema),
  403: jsonResponse("FORBIDDEN / CSRF_INVALID", ApiErrorSchema),
  422: jsonResponse("VALIDATION_FAILED", ApiErrorSchema),
};

/** ?active=true|false on master-data lists. */
export const ActiveQuery = z.enum(["true", "false"]).transform((v) => v === "true").optional();

export const NameSchema = z.string().trim().min(1, "Required").max(60, "At most 60 characters");
