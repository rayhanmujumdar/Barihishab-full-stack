import { z } from "zod";
import { apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { readErrors, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth, cookieAuthRead } from "@/lib/api/schemas";
import { registry } from "../registry";
import { AttachmentSchema } from "../transactions/[id]/schema";

export const NOTICES_TAG = "Notices";

const TITLE_MSG = "Add a title.";
const BODY_MSG = "Write the message.";
export const NoticeTitleSchema = z.string({ error: TITLE_MSG }).trim().min(1, TITLE_MSG).max(120, "At most 120 characters");
export const NoticeTextSchema = z
  .string({ error: BODY_MSG })
  .trim()
  .min(1, BODY_MSG)
  .max(3000, "At most 3,000 characters")
  .meta({ description: "≤ 3,000 characters; **bold**, \"- \" bullets and [text](https://…) links (G4)" });
export const NoticePrioritySchema = z.enum(["NORMAL", "URGENT"]).meta({ id: "NoticePriority" });
const PinUntilSchema = z.iso.date({ error: "Pick today or a later date." }).nullable().meta({ example: "2026-10-26", description: "Asia/Dhaka date; unpins the day after (G2)" });
const FileIds = z.array(z.uuid()).max(5, "At most 5 files.");

export const PublishNoticeBodySchema = z
  .object({
    title: NoticeTitleSchema,
    body: NoticeTextSchema,
    priority: NoticePrioritySchema.default("NORMAL"),
    pinned: z.boolean().default(false),
    pinUntil: PinUntilSchema.optional(),
    attachmentIds: FileIds.optional(),
  })
  .strict()
  .meta({ id: "PublishNoticeBody" });

export const EditNoticeBodySchema = z
  .object({
    title: NoticeTitleSchema.optional(),
    body: NoticeTextSchema.optional(),
    priority: NoticePrioritySchema.optional(),
    pinned: z.boolean().optional(),
    pinUntil: PinUntilSchema.optional(),
    attachmentIds: FileIds.optional().meta({ description: "Files to add (total ≤ 5)" }),
    removeAttachmentIds: z.array(z.uuid()).max(5).optional(),
    emailChange: z.boolean().optional().meta({ description: "Email active members about the change (N3)" }),
  })
  .strict()
  .meta({ id: "EditNoticeBody" });

export const ListNoticesQuerySchema = z.object({
  archived: z.enum(["1", "0"]).optional().transform((v) => v === "1"),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const NoticeSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    body: z.string(),
    priority: NoticePrioritySchema,
    pinned: z.boolean().meta({ description: "Effectively pinned today (Asia/Dhaka)" }),
    pinUntil: z.iso.date().nullable(),
    publishedAt: z.iso.datetime(),
    authorName: z.string(),
    editedAt: z.iso.datetime().nullable(),
    archivedAt: z.iso.datetime().nullable(),
    attachments: z.array(AttachmentSchema),
    readCount: z.number().int().meta({ description: "Reads by current active members" }),
    memberCount: z.number().int().meta({ description: "Current active members" }),
    read: z.boolean().meta({ description: "The viewer has read it" }),
    remindedToday: z.boolean(),
  })
  .meta({ id: "Notice" });

export const NoticeWriteSchema = z.object({ notice: NoticeSchema, emailed: z.number().int().meta({ description: "Outbox rows queued" }) });

registry.registerPath({
  method: "get",
  path: "/notices",
  tags: [NOTICES_TAG],
  summary: "List notices",
  description: "Permission `notice.view`. Live notices pinned first (newest first) then newest first; `archived=1` for Archived notices. `reachEmail` only with `notice.manage` (N1, N4).",
  security: cookieAuthRead,
  request: { query: z.object({ archived: z.enum(["1", "0"]).optional(), limit: z.number().int().min(1).max(200).optional() }) },
  responses: {
    200: jsonResponse(
      "Notices",
      apiSuccessSchema(
        "NoticeListResponse",
        z.object({ items: z.array(NoticeSchema), more: z.boolean(), activeMembers: z.number().int(), unread: z.number().int(), reachEmail: z.number().int().nullable() }),
      ),
    ),
    ...readErrors,
  },
});

registry.registerPath({
  method: "post",
  path: "/notices",
  tags: [NOTICES_TAG],
  summary: "Publish a notice",
  description: "Permission `notice.manage`. Records the author's read and emails active members (urgent ignores the email opt-out) (N2, Rule 3).",
  security: cookieAuth,
  request: { body: { content: { "application/json": { schema: PublishNoticeBodySchema } } } },
  responses: { 201: jsonResponse("Published", apiSuccessSchema("PublishNoticeResponse", NoticeWriteSchema)), ...writeErrors },
});

