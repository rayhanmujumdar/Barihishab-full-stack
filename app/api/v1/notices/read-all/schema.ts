import { z } from "zod";
import { apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { registry } from "../../registry";
import { NOTICES_TAG } from "../schema";

registry.registerPath({
  method: "post",
  path: "/notices/read-all",
  tags: [NOTICES_TAG],
  summary: "Mark all notices as read",
  description: "Permission `notice.view`. Records a read for every live notice the caller hasn't read (G5).",
  security: cookieAuth,
  responses: { 200: jsonResponse("Read", apiSuccessSchema("ReadAllNoticesResponse", z.object({ marked: z.number().int(), unread: z.number().int() }))), ...writeErrors },
});
