import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { IdempotencyHeader, IsoDateSchema, KindSchema, MonthKeySchema, readErrors, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth, cookieAuthRead } from "@/lib/api/schemas";
import { MAX_AMOUNT_PAISA } from "@/lib/money";
import { MSG } from "@/lib/transactions/rules";
import { registry } from "../registry";

// ─── Shared shapes (also imported by the sub-routes' schema.ts) ───

export const AmountSchema = z
  .number({ error: MSG.amount })
  .int(MSG.amount)
  .min(1, MSG.amount)
  .max(MAX_AMOUNT_PAISA, "At most ৳1 crore per entry.")
  .meta({ description: "Integer paisa (৳1 = 100)", example: 630000 });

export const entryFields = {
  period: MonthKeySchema,
  categoryId: z.uuid(MSG.category),
  amountPaisa: AmountSchema,
  txnDate: IsoDateSchema,
  fundAccountId: z.uuid(MSG.fund),
  unitId: z.uuid(MSG.unit).nullable().optional(),
  vendor: z.string().trim().max(100, "At most 100 characters").nullable().optional(),
  description: z.string().trim().max(200, "At most 200 characters").nullable().optional(),
  fromReserve: z.boolean().optional(),
  referencePeriod: MonthKeySchema.nullable().optional(),
};

export const TransactionSchema = z
  .object({
    id: z.uuid(),
    period: MonthKeySchema,
    periodStatus: z.enum(["OPEN", "CLOSED"]),
    kind: KindSchema,
    categoryId: z.uuid(),
    category: z.object({ code: z.string(), nameEn: z.string(), nameBn: z.string() }),
    unitId: z.uuid().nullable(),
    unitName: z.string().nullable(),
    amountPaisa: z.number().int(),
    txnDate: IsoDateSchema,
    fundAccountId: z.uuid(),
    fundAccountName: z.string(),
    vendor: z.string().nullable(),
    description: z.string().nullable(),
    fromReserve: z.boolean(),
    referencePeriod: MonthKeySchema.nullable(),
    source: z.enum(["MANUAL", "GENERATED_RENT", "ADJUSTMENT"]),
    isCorrected: z.boolean(),
    voidedAt: z.iso.datetime().nullable(),
    voidReason: z.string().nullable(),
    attachmentCount: z.number().int(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "Transaction" });

export const PeriodTotalsSchema = z
  .object({
    incomePaisa: z.number().int(),
    expensePaisa: z.number().int().meta({ description: "Excludes From-Reserve expenses" }),
    reserveSpentPaisa: z.number().int(),
    incomeCount: z.number().int(),
    expenseCount: z.number().int(),
  })
  .meta({ id: "PeriodTotals" });

export const WarningSchema = z
  .object({
    code: z.enum(["RENT_ALREADY_RECORDED", "POSSIBLE_DUPLICATE", "FUND_NEGATIVE", "DATE_FAR_FROM_PERIOD"]),
    fundAccountId: z.uuid().optional(),
    balancePaisa: z.number().int().optional(),
  })
  .meta({ id: "TransactionWarning" });

export const WriteResultSchema = z
  .object({ transaction: TransactionSchema, warnings: z.array(WarningSchema), periodTotals: PeriodTotalsSchema })
  .meta({ id: "TransactionWriteResult" });

// ─── This route ───

export const CreateTxnBodySchema = z
  .object({ ...entryFields, kind: KindSchema, attachmentIds: z.array(z.uuid()).max(5, "An entry can have at most 5 files.").optional() })
  .strict()
  .meta({ id: "CreateTransactionBody" });

export const ListTxnQuerySchema = z.object({
  period: MonthKeySchema,
  kind: KindSchema.optional(),
  category: z.string().trim().max(40).optional().meta({ description: "Category code, or ALL" }),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

registry.registerPath({
  method: "get",
  path: "/transactions",
  tags: ["Income & expenses"],
  summary: "List a month's entries (newest first) with the filter total",
  description: "Permission `transaction.view`. Voided rows are listed but excluded from `totalPaisa`.",
  security: cookieAuthRead,
  request: { query: ListTxnQuerySchema },
  responses: {
    200: jsonResponse(
      "Entries",
      apiSuccessSchema("TransactionListResponse", z.object({ items: z.array(TransactionSchema), nextCursor: z.uuid().nullable(), totalPaisa: z.number().int() })),
    ),
    ...readErrors,
  },
});

registry.registerPath({
  method: "post",
  path: "/transactions",
  tags: ["Income & expenses"],
  summary: "Record an income or expense",
  description: "Permission `transaction.create` (+ `transaction.adjust` for Arrear rent). Requires `Idempotency-Key`. Soft warnings never block.",
  security: cookieAuth,
  request: { headers: IdempotencyHeader, body: { content: { "application/json": { schema: CreateTxnBodySchema } } } },
  responses: {
    201: jsonResponse("Created", apiSuccessSchema("CreateTransactionResponse", WriteResultSchema)),
    ...writeErrors,
    409: jsonResponse("PERIOD_CLOSED / IDEMPOTENCY_CONFLICT", ApiErrorSchema),
  },
});
