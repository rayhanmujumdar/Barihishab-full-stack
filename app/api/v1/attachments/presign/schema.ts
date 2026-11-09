import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { ALLOWED_MIME } from "@/lib/files/magic";
import { registry } from "../../registry";

const BAD = "Only JPG, PNG, WebP or PDF up to 5 MB.";

export const PresignBodySchema = z
  .object({
    fileName: z.string().trim().min(1).max(200),
    mime: z.enum(ALLOWED_MIME, BAD),
    size: z.number().int().min(1, BAD),
  })
  .strict()
  .meta({ id: "PresignBody" });

export const PresignResultSchema = z
  .object({
    attachmentId: z.uuid(),
    uploadUrl: z.url().meta({ description: "PUT the file here within 5 minutes with exactly these headers" }),
    headers: z.record(z.string(), z.string()),
    expiresAt: z.iso.datetime(),
  })
  .meta({ id: "PresignResult" });

registry.registerPath({
  method: "post",
  path: "/attachments/presign",
  tags: ["Attachments"],
  summary: "Get a 5-minute upload URL for a bill or receipt",
  description: "Permission `transaction.create`. JPG/PNG/WebP/PDF ≤ 5 MB. At most 30 per 10 minutes per user; unlinked uploads are removed after 24 h. Link the returned id via the entry create body or POST /transactions/{id}/attachments.",
  security: cookieAuth,
  request: { body: { content: { "application/json": { schema: PresignBodySchema } } } },
  responses: {
    201: jsonResponse("Upload URL", apiSuccessSchema("PresignResponse", PresignResultSchema)),
    ...writeErrors,
    413: jsonResponse("FILE_TOO_LARGE", ApiErrorSchema),
    429: jsonResponse("RATE_LIMITED (30 uploads per 10 minutes per user)", ApiErrorSchema),
  },
});
