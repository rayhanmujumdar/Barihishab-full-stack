import { z } from "zod";
import { apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { MonthKeySchema, readErrors, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth, cookieAuthRead } from "@/lib/api/schemas";
import { LINK_TYPES } from "@/lib/complaints/links";
import { COMPLAINT_STATUSES } from "@/lib/complaints/rules";
import { COMPLAINT_FILTERS } from "@/lib/complaints/complaint-read";
import { registry } from "../registry";
import { AttachmentSchema } from "../transactions/[id]/schema";

export const COMPLAINTS_TAG = "Complaints";

export const ComplaintStatusSchema = z.enum(COMPLAINT_STATUSES).meta({ id: "ComplaintStatus" });
export const ComplaintVisibilitySchema = z.enum(["ALL", "ADMIN"]).meta({ id: "ComplaintVisibility", description: "ALL = Everyone; ADMIN = only the complainant and the Super Admin" });
export const LinkTypeSchema = z.enum(LINK_TYPES, { error: "Pick what it is about." }).meta({ id: "ComplaintLinkType" });
export const LinkRefSchema = z.object({ type: LinkTypeSchema, id: z.uuid("Pick an item.") }).meta({ id: "ComplaintLinkRef" });
export const LocaleQuery = z.object({ locale: z.enum(["bn", "en"]).optional().meta({ description: "Language of item labels (default en)" }) });

export const LinkItemSchema = z
  .object({
    type: LinkTypeSchema,
    id: z.uuid(),
    subject: z.string().nullable().meta({ example: "Electricity" }),
    date: z.iso.date().nullable(),
    amountPaisa: z.number().int().nullable(),
    month: MonthKeySchema.nullable(),
    hidden: z.boolean().meta({ description: "The viewer may not open this item; only its type is shown" }),
  })
  .meta({ id: "ComplaintLinkItem" });

export const ComplaintSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    status: ComplaintStatusSchema,
    visibility: ComplaintVisibilitySchema,
    reopened: z.boolean(),
    aboutAdmin: z.boolean().meta({ description: "About the Admin's own entry (G14)" }),
    authorId: z.uuid(),
    authorName: z.string(),
    mine: z.boolean(),
    createdAt: z.iso.datetime(),
    closedAt: z.iso.datetime().nullable(),
    link: LinkItemSchema.nullable(),
    commentCount: z.number().int(),
    unseen: z.boolean().meta({ description: "The viewer takes part and has unseen comments" }),
  })
  .meta({ id: "Complaint" });

const ThreadItemSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("comment"),
      id: z.uuid(),
      authorId: z.uuid(),
      authorName: z.string(),
      isAdmin: z.boolean(),
      body: z.string().nullable().meta({ description: "null when hidden" }),
      hiddenReason: z.string().nullable(),
      createdAt: z.iso.datetime(),
      editedAt: z.iso.datetime().nullable(),
      attachments: z.array(AttachmentSchema),
      editableUntil: z.iso.datetime().nullable(),
    }),
    z.object({ kind: z.literal("status"), id: z.string(), actorName: z.string(), status: z.union([ComplaintStatusSchema, z.literal("PUBLIC")]), note: z.string().nullable(), at: z.iso.datetime() }),
  ])
  .meta({ id: "ComplaintThreadItem" });

export const ComplaintDetailSchema = ComplaintSchema.extend({
  body: z.string(),
  attachments: z.array(AttachmentSchema),
  resolution: z.object({ note: z.string(), byName: z.string(), at: z.iso.datetime(), fix: LinkItemSchema.nullable() }).nullable(),
  thread: z.array(ThreadItemSchema),
  actions: z.object({ comment: z.boolean(), withdraw: z.boolean(), reopen: z.boolean(), publish: z.boolean(), decide: z.boolean(), hide: z.boolean() }),
}).meta({ id: "ComplaintDetail" });

export const ComplaintWriteResponse = (id: string) => apiSuccessSchema(id, z.object({ complaint: ComplaintDetailSchema }));

const TITLE_MSG = "Add a title.";
const BODY_MSG = "Tell us what's wrong in a few words (at least 10 characters).";
export const RaiseComplaintBodySchema = z
  .object({
    title: z.string({ error: TITLE_MSG }).trim().min(1, TITLE_MSG).max(120, "At most 120 characters"),
    body: z.string({ error: BODY_MSG }).trim().min(10, BODY_MSG).max(2000, "At most 2,000 characters"),
    visibility: ComplaintVisibilitySchema.default("ALL"),
    link: LinkRefSchema.nullable().optional(),
    attachmentIds: z.array(z.uuid()).max(5, "At most 5 files.").optional(),
  })
  .strict()
  .meta({ id: "RaiseComplaintBody" });

export const ListComplaintsQuerySchema = LocaleQuery.extend({
  filter: z.enum(COMPLAINT_FILTERS).optional(),
  month: MonthKeySchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

registry.registerPath({
  method: "get",
  path: "/complaints",
  tags: [COMPLAINTS_TAG],
  summary: "List complaints",
  description: "Permission `complaint.view`. Admin-only complaints appear only for their author and `complaint.view.all`. Order: Open, In review (oldest first), then closed (newest first) (C1).",
  security: cookieAuthRead,
  request: { query: ListComplaintsQuerySchema },
  responses: { 200: jsonResponse("Complaints", apiSuccessSchema("ComplaintListResponse", z.object({ items: z.array(ComplaintSchema), more: z.boolean() }))), ...readErrors },
});

registry.registerPath({
  method: "post",
  path: "/complaints",
  tags: [COMPLAINTS_TAG],
  summary: "Raise a complaint",
  description: "Permission `complaint.create`. Everyone → other members get a short email (title + link); Admin only → the Super Admin (C2).",
  security: cookieAuth,
  request: { query: LocaleQuery, body: { content: { "application/json": { schema: RaiseComplaintBodySchema } } } },
  responses: { 201: jsonResponse("Raised", ComplaintWriteResponse("RaiseComplaintResponse")), ...writeErrors },
});

