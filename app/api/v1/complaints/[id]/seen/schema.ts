import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { registry } from "../../../registry";
import { COMPLAINTS_TAG } from "../../schema";

registry.registerPath({
  method: "post",
  path: "/complaints/{id}/seen",
  tags: [COMPLAINTS_TAG],
  summary: "Mark a complaint's thread as seen",
  description: "Permission `complaint.view`. Clears the unread-comments dot and its share of the Notices badge; reads never do (design D8).",
  security: cookieAuth,
  request: { params: z.object({ id: z.uuid() }) },
  responses: { 200: jsonResponse("Seen", apiSuccessSchema("ComplaintSeenResponse", z.object({}))), ...writeErrors, 404: jsonResponse("NOT_FOUND", ApiErrorSchema) },
});
