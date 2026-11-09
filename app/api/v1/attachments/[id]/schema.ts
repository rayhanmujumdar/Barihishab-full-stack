import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { idParam, readErrors } from "@/lib/api/money-schemas";
import { cookieAuthRead } from "@/lib/api/schemas";
import { registry } from "../../registry";

registry.registerPath({
  method: "get",
  path: "/attachments/{id}",
  tags: ["Attachments"],
  summary: "5-minute signed URL to view a bill or receipt",
  description: "Permission `attachment.view`. Linked, non-removed files only.",
  security: cookieAuthRead,
  request: { params: idParam },
  responses: {
    200: jsonResponse(
      "Signed URL",
      apiSuccessSchema("AttachmentUrlResponse", z.object({ url: z.url(), mime: z.string(), fileName: z.string(), expiresAt: z.iso.datetime() }).meta({ id: "AttachmentUrl" })),
    ),
    ...readErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
  },
});
