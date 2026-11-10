import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { IdempotencyHeader, IsoDateSchema, MonthKeySchema, readErrors, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth, cookieAuthRead } from "@/lib/api/schemas";
import { cashOutFields, LedgerWarningSchema, LoanSchema, LoanStatusSchema, needsReference, PositiveAmountSchema, REF_REQUIRED } from "../payouts/schema";
import { registry } from "../registry";

export const LOANS_TAG = "Advances & loans";

/** PRD §9: every loan action needs a reason all owners can read. */
export const LoanReasonSchema = z.string().trim().min(1, "A reason is required — every owner can see it.").max(300, "At most 300 characters");

export const HistoryRowSchema = z
  .object({
    id: z.string(),
    kind: z.enum(["DISBURSED", "CASH_REPAYMENT", "DEDUCTION", "REVERSAL", "CANCELLED", "WRITTEN_OFF", "SKIPPED"]),
    source: z.enum(["LOAN", "LEDGER", "MOVEMENT", "SNAPSHOT"]),
    date: IsoDateSchema,
    month: MonthKeySchema,
    amountPaisa: z.number().int().meta({ description: "Positive amount" }),
    effectPaisa: z.number().int().meta({ description: "Signed effect on the outstanding" }),
    runningPaisa: z.number().int().meta({ description: "Outstanding after this movement" }),
    onClose: z.boolean().meta({ description: "Taken automatically by a month close" }),
    voided: z.boolean(),
    voidReason: z.string().nullable(),
    voidable: z.boolean(),
    reversesId: z.string().nullable(),
    recordedBy: z.string().nullable(),
    note: z.string().nullable(),
  })
  .meta({ id: "LoanMovement" });

export const LoanCardSchema = LoanSchema.extend({
  ownerName: z.string(),
  repaidPaisa: z.number().int(),
  repaidCashPaisa: z.number().int(),
  repaidDeductionPaisa: z.number().int(),
  progress: z.number().meta({ description: "Repaid ÷ principal (0–1)" }),
  expectedFinishMonth: MonthKeySchema.nullable(),
  monthsLeft: z.number().int().nullable(),
  nextDeduction: z.object({ amountPaisa: z.number().int(), month: MonthKeySchema }).nullable(),
  recentMovements: z.array(HistoryRowSchema).meta({ description: "Last 3 movements, oldest first" }),
}).meta({ id: "LoanCard" });

export const LoanWarningSchema = z
  .object({
    code: z.enum(["FUND_SHORT", "HOUSE_FUND_SHORT", "OWNER_HAS_LOAN", "INSTALMENT_ABOVE_SHARE"]),
    fundAccountId: z.uuid().optional(),
    balancePaisa: z.number().int().optional(),
    loanNumber: z.number().int().optional(),
    outstandingPaisa: z.number().int().optional(),
    averageSharePaisa: z.number().int().optional(),
  })
  .meta({ id: "LoanWarning" });

export const ListLoansQuerySchema = z.object({ ownerId: z.uuid("Pick an owner.").optional(), status: LoanStatusSchema.optional() }).strict();

export const CreateLoanBodySchema = z
  .object({
    ...cashOutFields,
    installmentPaisa: PositiveAmountSchema.nullable().optional().meta({ description: "Optional monthly instalment taken on each close" }),
    reason: LoanReasonSchema.meta({ description: "Visible to every owner" }),
  })
  .strict()
  .refine(needsReference, { path: ["referenceNo"], message: REF_REQUIRED })
  .refine((b) => (b.installmentPaisa ?? 0) <= b.amountPaisa, { path: ["installmentPaisa"], message: "The instalment can't be more than the loan." })
  .meta({ id: "LoanBody" });

registry.registerPath({
  method: "get",
  path: "/loans",
  tags: [LOANS_TAG],
  summary: "Loans newest first with figures, schedule and last movements",
  description: "Permission `loan.view`. Filters `ownerId`, `status`. `summary` covers all loans regardless of filters (F1, F2).",
  security: cookieAuthRead,
  request: { query: ListLoansQuerySchema },
  responses: {
    200: jsonResponse(
      "Loans",
      apiSuccessSchema("LoanList", z.object({ loans: z.array(LoanCardSchema), summary: z.object({ loansOutstandingPaisa: z.number().int(), activeLoans: z.number().int() }) })),
    ),
    ...readErrors,
    422: jsonResponse("VALIDATION_FAILED", ApiErrorSchema),
  },
});

registry.registerPath({
  method: "post",
  path: "/loans",
  tags: [LOANS_TAG],
  summary: "Record a direct loan to an owner",
  description:
    "Permission `loan.create`. Requires `Idempotency-Key`. Posted while a month is open (`409 NO_OPEN_PERIOD`). Lowers the fund account; the owner's balance is unchanged. Gets the next loan number. Warnings never block: `OWNER_HAS_LOAN` (the loan is `flagged`), `INSTALMENT_ABOVE_SHARE`, `FUND_SHORT`, `HOUSE_FUND_SHORT` (F4).",
  security: cookieAuth,
  request: { headers: IdempotencyHeader, body: { content: { "application/json": { schema: CreateLoanBodySchema } } } },
  responses: {
    201: jsonResponse("Recorded", apiSuccessSchema("CreateLoanResponse", z.object({ loan: LoanSchema, warnings: z.array(z.union([LoanWarningSchema, LedgerWarningSchema])) }))),
    ...writeErrors,
    409: jsonResponse("NO_OPEN_PERIOD / IDEMPOTENCY_CONFLICT", ApiErrorSchema),
  },
});
