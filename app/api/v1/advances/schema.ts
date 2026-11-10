import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { IdempotencyHeader, IsoDateSchema, MonthKeySchema, readErrors, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth, cookieAuthRead } from "@/lib/api/schemas";
import { cashOutFields, LedgerEntrySchema, LedgerWarningSchema, needsReference, OriginSchema, OwnerReasonSchema, REF_REQUIRED } from "../payouts/schema";
import { registry } from "../registry";

export const AdvanceBodySchema = z
  .object({ ...cashOutFields, reason: OwnerReasonSchema.meta({ description: "Visible to every owner" }) })
  .strict()
  .refine(needsReference, { path: ["referenceNo"], message: REF_REQUIRED })
  .meta({ id: "AdvanceBody" });

registry.registerPath({
  method: "post",
  path: "/advances",
  tags: ["Owners"],
  summary: "Record an advance to an owner",
  description:
    "Permission `advance.create`. Requires `Idempotency-Key`. Posted in the latest open month. Tagged `isSelf` when the owner is the acting user. When (advance outstanding + amount) is above the advance limit (Settings multiplier × average entitlement of the last 3 closed months) it is saved with `flagged: true` and an `ADVANCE_OVER_LIMIT` warning; `OWNER_OWED` when the owner is still owed money (never blocks).",
  security: cookieAuth,
  request: { headers: IdempotencyHeader, body: { content: { "application/json": { schema: AdvanceBodySchema } } } },
  responses: {
    201: jsonResponse(
      "Recorded",
      apiSuccessSchema("AdvanceResponse", z.object({ entry: LedgerEntrySchema, balancePaisa: z.number().int(), warnings: z.array(LedgerWarningSchema) })),
    ),
    ...writeErrors,
    409: jsonResponse("NO_OPEN_PERIOD / IDEMPOTENCY_CONFLICT", ApiErrorSchema),
  },
});

export const ListAdvancesQuerySchema = z
  .object({
    ownerId: z.uuid("Pick an owner.").optional(),
    year: z.string().regex(/^\d{4}$/, "Use YYYY").transform(Number).optional(),
  })
  .strict();

export const AdvanceRowSchema = z
  .object({
    id: z.uuid(),
    ownerId: z.uuid(),
    ownerName: z.string(),
    date: IsoDateSchema,
    month: MonthKeySchema,
    amountPaisa: z.number().int().meta({ description: "Positive amount paid out" }),
    reason: z.string().nullable(),
    origin: OriginSchema,
    isSelf: z.boolean(),
    flagged: z.boolean(),
    status: z.enum(["OUTSTANDING", "RECOVERED", "VOID"]),
    recoveredMonth: MonthKeySchema.nullable(),
    voidReason: z.string().nullable(),
    ownerBalancePaisa: z.number().int().meta({ description: "The owner's balance now" }),
  })
  .meta({ id: "AdvanceRow" });

registry.registerPath({
  method: "get",
  path: "/advances",
  tags: ["Advances & loans"],
  summary: "Advance history with recovery status",
  description:
    "Permission `loan.view`. Filters `ownerId`, `year` (default this year, Asia/Dhaka). Status: OUTSTANDING while the owner's balance is below 0, RECOVERED in the month that brought it back (oldest first), VOID. `summary.paidInYearPaisa` excludes voided advances (F11, G5, §7.6).",
  security: cookieAuthRead,
  request: { query: ListAdvancesQuerySchema },
  responses: {
    200: jsonResponse(
      "Advances",
      apiSuccessSchema(
        "AdvanceList",
        z.object({
          advances: z.array(AdvanceRowSchema),
          summary: z.object({ advancesOutstandingPaisa: z.number().int(), paidInYearPaisa: z.number().int(), year: z.number().int(), years: z.array(z.number().int()) }),
          limit: z.object({ multiplierPct: z.number().int() }),
        }),
      ),
    ),
    ...readErrors,
    422: jsonResponse("VALIDATION_FAILED", ApiErrorSchema),
  },
});
