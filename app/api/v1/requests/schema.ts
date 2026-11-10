import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { IsoDateSchema, MonthKeySchema, readErrors, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth, cookieAuthRead } from "@/lib/api/schemas";
import { MAX_AMOUNT_PAISA } from "@/lib/money";
import { PayMethodSchema } from "../payouts/schema";
import { registry } from "../registry";

export const REQUESTS_TAG = "Requests";

export const RequestTypeSchema = z.enum(["ADVANCE", "LOAN", "GRANT"], { error: "Pick a type." }).meta({ id: "RequestType" });
export const RequestStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED", "WITHDRAWN", "DISBURSED"]).meta({ id: "RequestStatus" });

const AMOUNT_MSG = "Enter an amount greater than zero.";
export const RequestAmountSchema = z
  .number({ error: AMOUNT_MSG })
  .int(AMOUNT_MSG)
  .min(1, AMOUNT_MSG)
  .min(100, "Ask for at least ৳1.")
  .max(MAX_AMOUNT_PAISA, "At most ৳1 crore per request.")
  .meta({ description: "Integer paisa (৳1 = 100)", example: 1000000 });

const REASON_MSG = "Tell everyone what it is for.";
export const RequestReasonSchema = z
  .string({ error: REASON_MSG })
  .trim()
  .min(10, REASON_MSG)
  .max(500, "At most 500 characters")
  .meta({ description: "10–500 characters; other owners may see it once paid" });

const NeededBySchema = z.iso.date({ error: "Pick today or a later date." }).meta({ example: "2026-10-30", description: "Today or later (Asia/Dhaka)" });
const PlanSchema = z.string().trim().max(200, "At most 200 characters").nullable().optional().meta({ description: "Loans only, e.g. \"৳4,000 per month from entitlement\"" });
const FileIds = z.array(z.uuid()).max(3, "At most 3 files.");

/** Decision reasons (reject / withdraw): required, the requester always sees them (Rule 5). */
export const DecisionReasonSchema = z
  .string({ error: "Please write a reason — the requester will see it." })
  .trim()
  .min(1, "Please write a reason — the requester will see it.")
  .max(300, "At most 300 characters");

export const SubmitRequestBodySchema = z
  .object({
    ownerId: z.uuid("Pick an owner.").optional().meta({ description: "Record for another owner — needs `request.record` (F11)" }),
    type: RequestTypeSchema,
    amountPaisa: RequestAmountSchema,
    reason: RequestReasonSchema,
    neededBy: NeededBySchema,
    repaymentPlan: PlanSchema,
    attachmentIds: FileIds.optional(),
    privateAttachmentIds: FileIds.optional().meta({ description: "Subset of attachmentIds only the requester and Super Admin may open" }),
  })
  .strict()
  .meta({ id: "SubmitRequestBody" });

export const LinkedEntrySchema = z
  .object({
    kind: z.enum(["ADVANCE", "LOAN", "EXPENSE"]),
    id: z.uuid(),
    label: z.string(),
    loanNumber: z.number().int().nullable(),
    month: MonthKeySchema.nullable(),
    ownerId: z.string(),
    voided: z.boolean().meta({ description: "The advance/expense was voided or the loan cancelled (\"Entry voided\")" }),
  })
  .meta({ id: "RequestLinkedEntry" });

export const RequestSchema = z
  .object({
    id: z.uuid(),
    number: z.string().meta({ example: "R-2026-014" }),
    ownerId: z.uuid(),
    ownerName: z.string(),
    type: RequestTypeSchema,
    status: RequestStatusSchema,
    amountRequestedPaisa: z.number().int(),
    amountApprovedPaisa: z.number().int().nullable(),
    reason: z.string(),
    neededBy: IsoDateSchema,
    repaymentPlan: z.string().nullable(),
    askedOn: IsoDateSchema,
    isSelf: z.boolean(),
    recordedBy: z.string().nullable(),
    decidedBy: z.string().nullable(),
    decidedAt: z.iso.datetime().nullable(),
    decisionNote: z.string().nullable(),
    disbursedAt: z.iso.datetime().nullable(),
    overdue: z.boolean(),
    mine: z.boolean(),
    unseen: z.boolean().meta({ description: "A decision on the viewer's own request not yet seen" }),
    limited: z.boolean().meta({ description: "Another owner's paid-out request: public fields only" }),
    attachmentCount: z.number().int(),
    linkedEntry: LinkedEntrySchema.nullable(),
  })
  .meta({ id: "MoneyRequest" });

export const RequestWarningSchema = z
  .object({
    code: z.enum(["PENDING_EXISTS", "ADVANCE_OVER_LIMIT", "OWNER_OWED", "OWNER_HAS_LOAN", "FUND_SHORT", "HOUSE_FUND_SHORT"]),
    number: z.string().optional(),
    limitPaisa: z.number().int().optional(),
    balancePaisa: z.number().int().optional(),
    loanNumber: z.number().int().optional(),
    outstandingPaisa: z.number().int().optional(),
    fundAccountId: z.uuid().optional(),
  })
  .meta({ id: "RequestWarning" });

export const RequestWriteSchema = z.object({ request: RequestSchema, warnings: z.array(RequestWarningSchema) });

export const ListRequestsQuerySchema = z
  .object({
    ownerId: z.uuid("Pick an owner.").optional(),
    type: RequestTypeSchema.optional(),
    status: RequestStatusSchema.optional(),
    year: z.string().regex(/^\d{4}$/, "Use YYYY").transform(Number).optional(),
    limit: z.string().regex(/^\d{1,3}$/, "Use 1–500").transform(Number).optional().meta({ description: "History / Paid out page size (default 50, max 500)" }),
  })
  .strict();

const ListSchema = z.union([
  z.object({ scope: z.literal("all"), pending: z.array(RequestSchema), approved: z.array(RequestSchema), history: z.array(RequestSchema), historyMore: z.boolean(), years: z.array(z.number().int()) }),
  z.object({ scope: z.literal("own"), mine: z.array(RequestSchema), paidOut: z.array(RequestSchema), paidOutMore: z.boolean() }),
]);

registry.registerPath({
  method: "get",
  path: "/requests",
  tags: [REQUESTS_TAG],
  summary: "Requests the viewer may see",
  description:
    "Permission `request.view`. With `request.view.all`: `pending` (overdue first, then needed-by), `approved` (needed-by) and `history` (filters `ownerId`, `type`, `status`, `year`). Otherwise: `mine` (own, every status) and `paidOut` (everyone's DISBURSED, public fields only). `history` / `paidOut` are capped at `limit` (default 50) with `historyMore` / `paidOutMore`. Read-only: decisions are marked seen with `POST /requests/seen` (F1, F12).",
  security: cookieAuthRead,
  request: { query: ListRequestsQuerySchema },
  responses: { 200: jsonResponse("Requests", apiSuccessSchema("RequestList", ListSchema)), ...readErrors, 422: jsonResponse("VALIDATION_FAILED", ApiErrorSchema) },
});

registry.registerPath({
  method: "post",
  path: "/requests",
  tags: [REQUESTS_TAG],
  summary: "Request money (advance, loan or special grant)",
  description:
    "Permission `request.create` (+ `request.record` to send another owner's `ownerId`). Creates a PENDING request numbered R-{year}-{nnn}, emails every Super Admin. Warnings never block: `PENDING_EXISTS`, `ADVANCE_OVER_LIMIT`, `OWNER_OWED`, `OWNER_HAS_LOAN` (F2, F11).",
  security: cookieAuth,
  request: { body: { content: { "application/json": { schema: SubmitRequestBodySchema } } } },
  responses: {
    201: jsonResponse("Submitted", apiSuccessSchema("SubmitRequestResponse", RequestWriteSchema)),
    ...writeErrors,
    403: jsonResponse("FORBIDDEN / CSRF_INVALID / NO_OWNER_PROFILE", ApiErrorSchema),
  },
});

export { PayMethodSchema };
