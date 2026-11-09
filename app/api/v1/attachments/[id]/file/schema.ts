import { z } from "zod";
import { ApiErrorSchema, jsonResponse } from "@/lib/api/openapi";
import { idParam, readErrors } from "@/lib/api/money-schemas";
import { cookieAuthRead } from "@/lib/api/schemas";
import { registry } from "../../../registry";

const binary = z.string().meta({ format: "binary" });
const fileHeaders = z.object({
  "Content-Disposition": z.string().meta({ description: "`inline` (or `attachment` with `download=1`) with the original file name", example: `inline; filename="desco-oct.pdf"; filename*=UTF-8''desco-oct.pdf` }),
  ETag: z.string().meta({ description: "Stable — files are never replaced in place" }),
  "Cache-Control": z.string().meta({ example: "private, max-age=300" }),
  "X-Content-Type-Options": z.literal("nosniff"),
});

registry.registerPath({
  method: "get",
  path: "/attachments/{id}/file",
  tags: ["Attachments"],
  summary: "Stream a bill or receipt from the app's own origin",
  description:
    "Permission `attachment.view`. Same-origin proxy to the private bucket: the response never exposes the storage host, key or a signature. " +
    "Linked, non-removed files of this property only. `Content-Type` is the validated stored type (JPEG, PNG, WebP or PDF). Send `If-None-Match` to get `304` for an unchanged file.",
  security: cookieAuthRead,
  request: {
    params: idParam,
    query: z.object({ download: z.literal("1").optional().meta({ description: "Serve as `attachment` so the browser saves the file" }) }),
    headers: z.object({ "If-None-Match": z.string().optional() }),
  },
  responses: {
    200: {
      description: "The file bytes",
      headers: fileHeaders,
      content: { "image/jpeg": { schema: binary }, "image/png": { schema: binary }, "image/webp": { schema: binary }, "application/pdf": { schema: binary } },
    },
    304: { description: "Not modified — the browser's cached copy is current" },
    ...readErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
    500: jsonResponse("INTERNAL_ERROR", ApiErrorSchema),
  },
});
