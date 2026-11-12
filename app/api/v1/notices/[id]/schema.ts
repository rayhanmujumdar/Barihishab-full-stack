import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { registry } from "../../registry";
import { EditNoticeBodySchema, NOTICES_TAG, NoticeWriteSchema } from "../schema";

export { EditNoticeBodySchema };

registry.registerPath({
  method: "patch",
  path: "/notices/{id}",
  tags: [NOTICES_TAG],
  summary: "Edit, pin or unpin a notice",
  description: "Permission `notice.manage`. Title/body/priority/file changes show \"Edited\"; pin changes don't. `emailChange` emails active members (N3).",
  security: cookieAuth,
  request: { params: z.object({ id: z.uuid() }), body: { content: { "application/json": { schema: EditNoticeBodySchema } } } },
  responses: {
    200: jsonResponse("Saved", apiSuccessSchema("EditNoticeResponse", NoticeWriteSchema)),
    ...writeErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
    409: jsonResponse("NOTICE_ARCHIVED", ApiErrorSchema),
  },
});
