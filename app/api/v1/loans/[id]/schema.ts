import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { MonthKeySchema, readErrors, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth, cookieAuthRead } from "@/lib/api/schemas";
import { LoanSchema, PayMethodSchema, PositiveAmountSchema } from "../../payouts/schema";
import { registry } from "../../registry";
import { HistoryRowSchema, LoanCardSchema, LoanReasonSchema, LOANS_TAG } from "../schema";

export const PatchLoanBodySchema = z
  .object({
    installmentPaisa: PositiveAmountSchema.nullable().meta({ description: "Monthly instalment deducted on month close; null = Manual" }),
    reason: LoanReasonSchema,
  })
  .strict()
  .meta({ id: "PatchLoanBody" });

export const LoanDetailSchema = z
  .object({
    loan: LoanCardSchema.extend({
      fundAccountId: z.uuid(),
      fundAccountName: z.string(),
      method: PayMethodSchema,
      referenceNo: z.string().nullable(),
      payoutEntryId: z.uuid().nullable(),
      recordedBy: z.string(),
    }),
    movements: z.array(HistoryRowSchema),
    changes: z.array(z.object({ at: z.iso.datetime(), action: z.string(), by: z.string().nullable(), before: z.unknown(), after: z.unknown(), reason: z.string().nullable() })),
  })
  .meta({ id: "LoanDetail" });

const idParam = z.object({ id: z.uuid() });

registry.registerPath({
  method: "get",
  path: "/loans/{id}",
  tags: [LOANS_TAG],
  summary: "One loan with its full movement and change history",
  description: "Permission `loan.view`. Movements oldest first with the running outstanding, incl. skipped instalments; changes from the audit log (F3).",
  security: cookieAuthRead,
  request: { params: idParam },
  responses: { 200: jsonResponse("Loan", apiSuccessSchema("LoanDetailResponse", LoanDetailSchema)), ...readErrors, 404: jsonResponse("Unknown loan", ApiErrorSchema) },
});

registry.registerPath({
  method: "patch",
  path: "/loans/{id}",
  tags: [LOANS_TAG],
  summary: "Change a loan's monthly instalment (with a reason)",
  description:
    "Permission `loan.manage`. Only ACTIVE loans (`409 LOAN_NOT_ACTIVE`); the instalment can't exceed the outstanding (`422`). `reason` is required (F7) — a breaking change from the Distribution version, made while the only client is this app. Applies from the next month close.",
  security: cookieAuth,
  request: { params: idParam, body: { content: { "application/json": { schema: PatchLoanBodySchema } } } },
  responses: {
    200: jsonResponse("Updated", apiSuccessSchema("LoanResponse", z.object({ loan: LoanSchema, expectedFinishMonth: MonthKeySchema.nullable() }))),
    ...writeErrors,
    404: jsonResponse("Unknown loan", ApiErrorSchema),
    409: jsonResponse("LOAN_NOT_ACTIVE", ApiErrorSchema),
  },
});
