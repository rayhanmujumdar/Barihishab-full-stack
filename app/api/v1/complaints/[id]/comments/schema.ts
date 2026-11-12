import { z } from "zod";
import { ApiErrorSchema, jsonResponse } from "@/lib/api/openapi";
import { writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { registry } from "../../../registry";
import { COMPLAINTS_TAG, ComplaintWriteResponse, LocaleQuery } from "../../../complaints/schema";

export const AddCommentBodySchema = z
  .object({
    body: z.string({ error: "Write a comment." }).trim().min(1, "Write a comment.").max(2000, "At most 2,000 characters"),
    attachmentIds: z.array(z.uuid()).max(3, "At most 3 files.").optional(),
  })
  .strict()
  .meta({ id: "AddCommentBody" });

registry.registerPath({
  method: "post",
  path: "/complaints/{id}/comments",
  tags: [COMPLAINTS_TAG],
  summary: "Add a comment",
  description: "Permission `complaint.view`. Live complaints only; up to 3 files (C7, G8).",
  security: cookieAuth,
  request: { params: z.object({ id: z.uuid() }), query: LocaleQuery, body: { content: { "application/json": { schema: AddCommentBodySchema } } } },
  responses: {
    201: jsonResponse("Added", ComplaintWriteResponse("AddCommentResponse")),
    ...writeErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
    409: jsonResponse("COMPLAINT_CLOSED", ApiErrorSchema),
  },
});
