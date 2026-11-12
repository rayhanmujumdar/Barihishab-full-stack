import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { registry } from "../../../registry";
import { NOTICES_TAG } from "../../schema";

registry.registerPath({
  method: "post",
  path: "/notices/{id}/read",
  tags: [NOTICES_TAG],
  summary: "Mark a notice as read",
  description: "Permission `notice.view`. Idempotent; the first read time is kept and reads are never undone (N4, Rule 4).",
  security: cookieAuth,
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: jsonResponse("Read", apiSuccessSchema("ReadNoticeResponse", z.object({ unread: z.number().int() }))),
    ...writeErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
  },
});
