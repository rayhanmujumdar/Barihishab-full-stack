import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { IdempotencyHeader, IsoDateSchema, MonthKeySchema, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { MAX_AMOUNT_PAISA } from "@/lib/money";
import { registry } from "../registry";

// ─── Shared ledger shapes (also used by advances, adjustments, void, statement) ───

export const LedgerTypeSchema = z.enum(["OPENING", "ENTITLEMENT", "PAYOUT", "ADVANCE", "LOAN_DEDUCTION", "ADJUSTMENT", "REVERSAL"]).meta({ id: "LedgerType" });
export const OriginSchema = z.enum(["DIRECT", "CLOSE", "PAYOUT_SPLIT"]).meta({ id: "EntryOrigin", description: "Where the entry came from" });
export const PayMethodSchema = z.enum(["CASH", "BANK", "BKASH", "NAGAD"], { error: "Pick a method." }).meta({ id: "PayMethod" });
export const OwnerReasonSchema = z.string().trim().min(1, "Please write a reason — everyone can see it.").max(300, "At most 300 characters");
export const REF_REQUIRED = "Add the bKash TrxID, Nagad TrxID or cheque number.";

export const PositiveAmountSchema = z
  .number({ error: "Enter an amount." })
  .int("Enter an amount.")
  .min(1, "Enter an amount.")
  .max(MAX_AMOUNT_PAISA, "At most ৳1 crore per entry.")
  .meta({ description: "Integer paisa (৳1 = 100)", example: 870390 });

export const LedgerEntrySchema = z
  .object({
    id: z.uuid(),
    ownerId: z.uuid(),
    type: LedgerTypeSchema,
    amountPaisa: z.number().int().meta({ description: "Signed: + owed by the house, − paid / advanced" }),
    date: IsoDateSchema,
    month: MonthKeySchema.meta({ description: "Posting month" }),
    fundAccountId: z.uuid().nullable(),
    fundAccountName: z.string().nullable(),
    method: PayMethodSchema.nullable(),
    referenceNo: z.string().nullable(),
    note: z.string().nullable(),
    referenceMonth: MonthKeySchema.nullable(),
    reversesId: z.uuid().nullable(),
    voided: z.boolean(),
    voidedAt: z.iso.datetime().nullable(),
    voidReason: z.string().nullable(),
    isSelf: z.boolean(),
    flagged: z.boolean(),
    origin: OriginSchema,
    recordedBy: z.string(),
    recordedAt: z.iso.datetime(),
    attachments: z.array(z.object({ id: z.uuid(), fileName: z.string(), mime: z.string() })),
  })
  .meta({ id: "LedgerEntry" });

export const LedgerWarningSchema = z
  .object({
    code: z.enum(["FUND_SHORT", "HOUSE_FUND_SHORT", "ADVANCE_OVER_LIMIT", "OWNER_OWED"]),
    fundAccountId: z.uuid().optional(),
    balancePaisa: z.number().int().optional(),
    limitPaisa: z.number().int().optional(),
  })
  .meta({ id: "LedgerWarning" });

export const LoanStatusSchema = z.enum(["ACTIVE", "REPAID", "WRITTEN_OFF", "CANCELLED"]).meta({ id: "LoanStatus" });

export const LoanSchema = z
  .object({
    id: z.uuid(),
    number: z.number().int().meta({ description: "Shown as L{number}; sequential per house, never reused" }),
    ownerId: z.uuid(),
    principalPaisa: z.number().int(),
    disbursedOn: IsoDateSchema,
    status: LoanStatusSchema,
    reason: z.string(),
    installmentPaisa: z.number().int().nullable().meta({ description: "Monthly instalment deducted from entitlement on month close" }),
    outstandingPaisa: z.number().int().meta({ description: "Principal − deductions − cash repayments (+ reversals)" }),
    origin: z.enum(["DIRECT", "PAYOUT_SPLIT"]),
    isSelf: z.boolean(),
    flagged: z.boolean(),
  })
  .meta({ id: "Loan" });

/** Fields shared by payouts and advances. */
export const cashOutFields = {
  ownerId: z.uuid("Pick an owner."),
  amountPaisa: PositiveAmountSchema,
  date: IsoDateSchema,
  fundAccountId: z.uuid("Pick a fund account."),
  method: PayMethodSchema,
  referenceNo: z.string().trim().max(60, "At most 60 characters").nullable().optional(),
  attachmentIds: z.array(z.uuid()).max(5, "At most 5 files.").optional(),
};

/** Rule 15: Bank, bKash and Nagad need a reference number; cash doesn't. */
export const needsReference = (b: { method: string; referenceNo?: string | null }) => b.method === "CASH" || !!b.referenceNo;

// ─── This route ───

export const PayoutBodySchema = z
  .object({
    ...cashOutFields,
    note: z.string().trim().max(200, "At most 200 characters").nullable().optional(),
    splitExcessAs: z.enum(["ADVANCE", "LOAN"]).optional().meta({ description: "How to record the part above the owner's positive balance" }),
    excessReason: z.string().trim().max(300, "At most 300 characters").nullable().optional(),
    loanInstallmentPaisa: PositiveAmountSchema.nullable().optional().meta({ description: "Monthly instalment when the excess is recorded as a LOAN (≤ the excess)" }),
  })
  .strict()
  .refine(needsReference, { path: ["referenceNo"], message: REF_REQUIRED })
  .meta({ id: "PayoutBody" });

export const PayoutResultSchema = z
  .object({ entries: z.array(LedgerEntrySchema), loan: LoanSchema.nullable(), balancePaisa: z.number().int(), warnings: z.array(LedgerWarningSchema) })
  .meta({ id: "PayoutResult" });

registry.registerPath({
  method: "post",
  path: "/payouts",
  tags: ["Owners"],
  summary: "Pay an owner from the House Fund",
  description:
    "Permission `payout.create`. Requires `Idempotency-Key`. Posted in the latest open month. Above the owner's positive balance → `409 EXCEEDS_BALANCE` with `details { balancePaisa, payoutPaisa, excessPaisa }`; re-send with `splitExcessAs` to record the excess as an ADVANCE entry or a loan. Fund shortfalls are warnings, never blocks.",
  security: cookieAuth,
  request: { headers: IdempotencyHeader, body: { content: { "application/json": { schema: PayoutBodySchema } } } },
  responses: {
    201: jsonResponse("Recorded", apiSuccessSchema("PayoutResponse", PayoutResultSchema)),
    ...writeErrors,
    409: jsonResponse("EXCEEDS_BALANCE / NO_OPEN_PERIOD / IDEMPOTENCY_CONFLICT", ApiErrorSchema),
  },
});
