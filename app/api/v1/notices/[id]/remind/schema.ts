import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { registry } from "../../../registry";
import { NOTICES_TAG } from "../../schema";

registry.registerPath({
  method: "post",
  path: "/notices/{id}/remind",
  tags: [NOTICES_TAG],
  summary: "Remind members who haven't read an urgent notice",
  description: "Permission `notice.manage`. Urgent, live notices only; once per notice per Asia/Dhaka day; the email opt-out doesn't apply (N4, G6).",
  security: cookieAuth,
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: jsonResponse("Reminded", apiSuccessSchema("RemindNoticeResponse", z.object({ reminded: z.number().int() }))),
    ...writeErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
    409: jsonResponse("NOT_URGENT / NOTICE_ARCHIVED / REMINDER_ALREADY_SENT", ApiErrorSchema),
  },
});
