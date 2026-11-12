import { z } from "zod";
import { ApiErrorSchema, jsonResponse } from "@/lib/api/openapi";
import { writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { registry } from "../../../../registry";
import { COMPLAINTS_TAG, ComplaintWriteResponse, LocaleQuery } from "../../../../complaints/schema";

export const EditCommentBodySchema = z
  .object({ body: z.string({ error: "Write a comment." }).trim().min(1, "Write a comment.").max(2000, "At most 2,000 characters") })
  .strict()
  .meta({ id: "EditCommentBody" });

registry.registerPath({
  method: "patch",
  path: "/complaints/{id}/comments/{commentId}",
  tags: [COMPLAINTS_TAG],
  summary: "Edit my comment",
  description: "Permission `complaint.view`. The author only, within 15 minutes, while the complaint is live (C7, G13).",
  security: cookieAuth,
  request: { params: z.object({ id: z.uuid(), commentId: z.uuid() }), query: LocaleQuery, body: { content: { "application/json": { schema: EditCommentBodySchema } } } },
  responses: {
    200: jsonResponse("Done", ComplaintWriteResponse("EditCommentResponse")),
    ...writeErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
    409: jsonResponse("EDIT_WINDOW_PASSED / COMPLAINT_CLOSED", ApiErrorSchema),
  },
});
