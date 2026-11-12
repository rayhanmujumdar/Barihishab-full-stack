import { z } from "zod";
import { ApiErrorSchema, jsonResponse } from "@/lib/api/openapi";
import { writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth } from "@/lib/api/schemas";
import { registry } from "../../../registry";
import { COMPLAINTS_TAG, ComplaintWriteResponse, LinkRefSchema, LocaleQuery } from "../../../complaints/schema";

export const SetComplaintStatusBodySchema = z
  .object({
    status: z.enum(["IN_REVIEW", "RESOLVED", "REJECTED"], { error: "Pick a status." }),
    explanation: z.string().trim().max(2000, "At most 2,000 characters").nullable().optional().meta({ description: "Required for RESOLVED / REJECTED; optional note for IN_REVIEW" }),
    fix: LinkRefSchema.nullable().optional().meta({ description: "\"Link the fix\" on RESOLVED" }),
  })
  .strict()
  .meta({ id: "SetComplaintStatusBody" });

registry.registerPath({
  method: "patch",
  path: "/complaints/{id}/status",
  tags: [COMPLAINTS_TAG],
  summary: "Set a complaint status",
  description: "Permission `complaint.decide`. IN_REVIEW (optional note) from Open; RESOLVED / REJECTED (explanation required, optional fix link on Resolve) from Open or In review (C4, Rule 10).",
  security: cookieAuth,
  request: { params: z.object({ id: z.uuid() }), query: LocaleQuery, body: { content: { "application/json": { schema: SetComplaintStatusBodySchema } } } },
  responses: {
    200: jsonResponse("Done", ComplaintWriteResponse("SetComplaintStatusResponse")),
    ...writeErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
    409: jsonResponse("INVALID_COMPLAINT_STATUS", ApiErrorSchema),
  },
});
