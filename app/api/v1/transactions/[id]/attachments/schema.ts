import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { registry } from "../../../registry";
import { AttachmentSchema } from "../schema";

export const LinkBodySchema = z
  .object({ attachmentIds: z.array(z.uuid()).min(1).max(5, "An entry can have at most 5 files.") })
  .strict()
  .meta({ id: "LinkAttachmentsBody" });

const conflict = { 409: jsonResponse("PERIOD_CLOSED / ALREADY_VOIDED", ApiErrorSchema), 404: jsonResponse("NOT_FOUND", ApiErrorSchema) };

registry.registerPath({
  method: "post",
  path: "/transactions/{id}/attachments",
  tags: ["Attachments"],
  summary: "Attach uploaded files to a saved entry (Open month)",
  description: "Permission `transaction.update`. Each file is checked: exists, size, magic bytes. Max 5 per entry.",
  security: cookieAuth,
  request: { params: z.object({ id: z.uuid() }), body: { content: { "application/json": { schema: LinkBodySchema } } } },
  responses: { 200: jsonResponse("Linked", apiSuccessSchema("LinkAttachmentsResponse", z.object({ attachments: z.array(AttachmentSchema) }))), ...writeErrors, ...conflict },
});

registry.registerPath({
  method: "delete",
  path: "/transactions/{id}/attachments/{attId}",
  tags: ["Attachments"],
  summary: "Remove a file from an entry (soft, audited)",
  description: "Permission `transaction.update`. Open month, non-voided entry.",
  security: cookieAuth,
  request: { params: z.object({ id: z.uuid(), attId: z.uuid() }) },
  responses: { 204: { description: "Removed" }, ...writeErrors, ...conflict },
});
