import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { idParam, readErrors } from "@/lib/api/money-schemas";
import { cookieAuthRead } from "@/lib/api/schemas";
import { registry } from "../../registry";

registry.registerPath({
  method: "get",
  path: "/attachments/{id}",
  tags: ["Attachments"],
  summary: "Where to load a bill or receipt from",
  description:
    "Permission `attachment.view`. Linked, non-removed files only. `url` is the same-origin path of the file proxy (`GET /attachments/{id}/file`) — no storage URL and no expiry; access is checked on every file request.",
  security: cookieAuthRead,
  request: { params: idParam },
  responses: {
    200: jsonResponse(
      "File location",
      apiSuccessSchema(
        "AttachmentUrlResponse",
        z
          .object({
            url: z.string().startsWith("/api/v1/attachments/").meta({ description: "Same-origin path; resolve against the app's origin", example: "/api/v1/attachments/3f1c…/file" }),
            mime: z.string(),
            fileName: z.string(),
          })
          .meta({ id: "AttachmentUrl" }),
      ),
    ),
    ...readErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
  },
});
