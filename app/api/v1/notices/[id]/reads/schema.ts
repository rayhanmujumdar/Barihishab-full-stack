import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { readErrors } from "@/lib/api/money-schemas";
import { cookieAuthRead } from "@/lib/api/schemas";
import { registry } from "../../../registry";
import { NOTICES_TAG } from "../../schema";

registry.registerPath({
  method: "get",
  path: "/notices/{id}/reads",
  tags: [NOTICES_TAG],
  summary: "Who has read a notice",
  description: "Permission `notice.manage`. Two lists over current active members: Read (with time, oldest first) and Not yet (N4, G6).",
  security: cookieAuthRead,
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: jsonResponse(
      "Reads",
      apiSuccessSchema(
        "NoticeReadsResponse",
        z.object({ read: z.array(z.object({ userId: z.uuid(), name: z.string(), readAt: z.iso.datetime() })), notRead: z.array(z.object({ userId: z.uuid(), name: z.string() })) }),
      ),
    ),
    ...readErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
  },
});
