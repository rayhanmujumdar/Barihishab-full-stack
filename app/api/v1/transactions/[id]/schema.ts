import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { idParam, ReasonSchema, readErrors, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth, cookieAuthRead } from "@/lib/api/schemas";
import { registry } from "../../registry";
import { entryFields, TransactionSchema, WriteResultSchema } from "../schema";

export const AttachmentSchema = z
  .object({ id: z.uuid(), fileName: z.string(), mime: z.string(), sizeBytes: z.number().int() })
  .meta({ id: "Attachment" });

export const TransactionDetailSchema = TransactionSchema.extend({
  recordedBy: z.string().nullable(),
  tenantName: z.string().nullable(),
  attachments: z.array(AttachmentSchema),
  history: z.array(
    z.object({
      action: z.string().meta({ example: "transaction.updated" }),
      at: z.iso.datetime(),
      actorName: z.string().nullable(),
      before: z.unknown(),
      after: z.unknown(),
      reason: z.string().nullable(),
    }),
  ),
}).meta({ id: "TransactionDetail" });

export const CorrectBodySchema = z
  .object({
    period: entryFields.period.optional(),
    categoryId: entryFields.categoryId.optional(),
    amountPaisa: entryFields.amountPaisa.optional(),
    txnDate: entryFields.txnDate.optional(),
    fundAccountId: entryFields.fundAccountId.optional(),
    unitId: entryFields.unitId,
    vendor: entryFields.vendor,
    description: entryFields.description,
    fromReserve: entryFields.fromReserve,
    referencePeriod: entryFields.referencePeriod,
    reason: ReasonSchema,
  })
  .strict()
  .meta({ id: "CorrectTransactionBody" });

registry.registerPath({
  method: "get",
  path: "/transactions/{id}",
  tags: ["Income & expenses"],
  summary: "One entry with attachments and change history",
  description: "Permission `transaction.view`.",
  security: cookieAuthRead,
  request: { params: idParam },
  responses: {
    200: jsonResponse("Entry", apiSuccessSchema("TransactionDetailResponse", TransactionDetailSchema)),
    ...readErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
  },
});

registry.registerPath({
  method: "patch",
  path: "/transactions/{id}",
  tags: ["Income & expenses"],
  summary: "Correct an entry in an Open month (reason required)",
  description: "Permission `transaction.update`. Only changed fields + reason are audited; sets `isCorrected`. The kind can't change.",
  security: cookieAuth,
  request: { params: idParam, body: { content: { "application/json": { schema: CorrectBodySchema } } } },
  responses: {
    200: jsonResponse("Corrected", apiSuccessSchema("CorrectTransactionResponse", WriteResultSchema)),
    ...writeErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
    409: jsonResponse("PERIOD_CLOSED / ALREADY_VOIDED / ENTRY_CHANGED", ApiErrorSchema),
  },
});
