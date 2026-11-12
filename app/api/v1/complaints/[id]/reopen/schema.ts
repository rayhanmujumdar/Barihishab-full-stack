import { z } from "zod";
import { ApiErrorSchema, jsonResponse } from "@/lib/api/openapi";
import { writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { registry } from "../../../registry";
import { COMPLAINTS_TAG, ComplaintWriteResponse, LocaleQuery } from "../../../complaints/schema";

export const ReopenComplaintBodySchema = z
  .object({ comment: z.string({ error: "Say why it isn't resolved." }).trim().min(1, "Say why it isn't resolved.").max(2000, "At most 2,000 characters") })
  .strict()
  .meta({ id: "ReopenComplaintBody" });

registry.registerPath({
  method: "post",
  path: "/complaints/{id}/reopen",
  tags: [COMPLAINTS_TAG],
  summary: "Reopen a resolved or rejected complaint",
  description: "Permission `complaint.view`; the complainant only, once, within 14 days of closing, with a comment (C6, G12).",
  security: cookieAuth,
  request: { params: z.object({ id: z.uuid() }), query: LocaleQuery, body: { content: { "application/json": { schema: ReopenComplaintBodySchema } } } },
  responses: {
    200: jsonResponse("Done", ComplaintWriteResponse("ReopenComplaintResponse")),
    ...writeErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
    409: jsonResponse("INVALID_COMPLAINT_STATUS / REOPEN_WINDOW_PASSED", ApiErrorSchema),
  },
});
