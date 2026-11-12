import { z } from "zod";
import { ApiErrorSchema, jsonResponse } from "@/lib/api/openapi";
import { writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { registry } from "../../../../../registry";
import { COMPLAINTS_TAG, ComplaintWriteResponse, LocaleQuery } from "../../../../../complaints/schema";

export const HideCommentBodySchema = z
  .object({ reason: z.string({ error: "Give a reason." }).trim().min(1, "Give a reason.").max(200, "At most 200 characters") })
  .strict()
  .meta({ id: "HideCommentBody" });

registry.registerPath({
  method: "post",
  path: "/complaints/{id}/comments/{commentId}/hide",
  tags: [COMPLAINTS_TAG],
  summary: "Hide a comment",
  description: "Permission `complaint.decide`. Shows \"Hidden by Admin: {reason}\" to everyone; the text stays in the audit log (G13).",
  security: cookieAuth,
  request: { params: z.object({ id: z.uuid(), commentId: z.uuid() }), query: LocaleQuery, body: { content: { "application/json": { schema: HideCommentBodySchema } } } },
  responses: {
    200: jsonResponse("Done", ComplaintWriteResponse("HideCommentResponse")),
    ...writeErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
    409: jsonResponse("INVALID_COMPLAINT_STATUS", ApiErrorSchema),
  },
});
