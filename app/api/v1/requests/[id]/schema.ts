import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { IsoDateSchema, MonthKeySchema, readErrors, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth, cookieAuthRead } from "@/lib/api/schemas";
import { registry } from "../../registry";
import { PayMethodSchema, RequestAmountSchema, RequestReasonSchema, RequestSchema, RequestTypeSchema, RequestWriteSchema, REQUESTS_TAG } from "../schema";

const FileIds = z.array(z.uuid()).max(3, "At most 3 files.");

export const EditRequestBodySchema = z
  .object({
    type: RequestTypeSchema.optional(),
    amountPaisa: RequestAmountSchema.optional(),
    reason: RequestReasonSchema.optional(),
    neededBy: z.iso.date({ error: "Pick today or a later date." }).optional(),
    repaymentPlan: z.string().trim().max(200, "At most 200 characters").nullable().optional(),
    attachmentIds: FileIds.optional().meta({ description: "New uploads to add (≤ 3 files in total)" }),
    privateAttachmentIds: FileIds.optional(),
    removeAttachmentIds: FileIds.optional(),
  })
  .strict()
  .meta({ id: "EditRequestBody" });

const TimelineItemSchema = z
  .object({
    kind: z.enum(["SUBMITTED", "RECORDED", "EDITED", "APPROVED", "REJECTED", "WITHDRAWN", "CANCELLED", "DISBURSED"]),
    at: z.iso.datetime(),
    by: z.string().nullable(),
    amountPaisa: z.number().int().nullable(),
    note: z.string().nullable(),
    date: IsoDateSchema.nullable(),
    method: PayMethodSchema.nullable(),
    referenceNo: z.string().nullable(),
  })
  .meta({ id: "RequestTimelineItem" });

const ContextSchema = z
  .object({
    balancePaisa: z.number().int(),
    loanOutstandingPaisa: z.number().int(),
    advanceLimitPaisa: z.number().int().nullable(),
    advanceUsedPaisa: z.number().int(),
    houseFundPaisa: z.number().int(),
    funds: z.array(z.object({ id: z.uuid(), name: z.string(), balancePaisa: z.number().int() })),
    openMonth: MonthKeySchema.nullable(),
    advance: z.object({ usedBeforePaisa: z.number().int(), usedAfterPaisa: z.number().int(), limitPaisa: z.number().int().nullable(), overLimit: z.boolean() }).nullable(),
    loan: z
      .object({
        activeLoans: z.array(z.object({ id: z.uuid(), number: z.number().int(), outstandingPaisa: z.number().int() })),
        planInstalmentPaisa: z.number().int().nullable(),
        finishesWithin24Months: z.boolean().nullable(),
      })
      .nullable(),
    grant: z
      .object({
        month: MonthKeySchema,
        distributableBeforePaisa: z.number().int(),
        dropPaisa: z.number().int(),
        owners: z.array(z.object({ ownerId: z.uuid(), name: z.string(), sharePct: z.number(), dropPaisa: z.number().int() })),
      })
      .nullable(),
    pendingOthers: z.array(z.string()),
    aboveHouseFund: z.boolean(),
  })
  .meta({ id: "RequestDecisionContext" });

export const RequestDetailSchema = z
  .object({
    request: RequestSchema,
    attachments: z.array(z.object({ id: z.uuid(), fileName: z.string(), mime: z.string(), sizeBytes: z.number().int(), isPrivate: z.boolean() })),
    timeline: z.array(TimelineItemSchema),
    context: ContextSchema.nullable(),
  })
  .meta({ id: "RequestDetail" });

const idParams = z.object({ id: z.uuid() });

registry.registerPath({
  method: "get",
  path: "/requests/{id}",
  tags: [REQUESTS_TAG],
  summary: "Request detail, files and timeline",
  description:
    "Permission `request.view`. Another owner's request is `404` unless DISBURSED (then public fields and non-private files only). `context` (balance, loans, limit, House Fund, type-specific figures) only with `request.view.all` for PENDING/APPROVED requests (F4, F9).",
  security: cookieAuthRead,
  request: { params: idParams },
  responses: { 200: jsonResponse("Detail", apiSuccessSchema("RequestDetailResponse", RequestDetailSchema)), ...readErrors, 404: jsonResponse("NOT_FOUND", ApiErrorSchema) },
});

registry.registerPath({
  method: "patch",
  path: "/requests/{id}",
  tags: [REQUESTS_TAG],
  summary: "Edit a pending request",
  description: "Permission `request.create`; only the requester, only while PENDING (`409 INVALID_REQUEST_STATUS`). Same rules as submit; Super Admins are emailed (F3, G3).",
  security: cookieAuth,
  request: { params: idParams, body: { content: { "application/json": { schema: EditRequestBodySchema } } } },
  responses: {
    200: jsonResponse("Edited", apiSuccessSchema("EditRequestResponse", RequestWriteSchema)),
    ...writeErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
    409: jsonResponse("INVALID_REQUEST_STATUS", ApiErrorSchema),
  },
});
