import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { registry } from "../../../registry";
import { NOTICES_TAG, NoticeSchema } from "../../schema";

registry.registerPath({
  method: "post",
  path: "/notices/{id}/archive",
  tags: [NOTICES_TAG],
  summary: "Archive a notice",
  description: "Permission `notice.manage`. Removes it from the list and Home; it stays under Archived notices and is never deleted (N3, Rule 5).",
  security: cookieAuth,
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: jsonResponse("Archived", apiSuccessSchema("ArchiveNoticeResponse", z.object({ notice: NoticeSchema }))),
    ...writeErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
    409: jsonResponse("NOTICE_ARCHIVED", ApiErrorSchema),
  },
});
