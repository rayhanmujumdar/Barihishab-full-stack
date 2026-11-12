import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { readErrors } from "@/lib/api/money-schemas";
import { cookieAuthRead } from "@/lib/api/schemas";
import { registry } from "../../registry";
import { COMPLAINTS_TAG, ComplaintDetailSchema, LocaleQuery } from "../schema";

registry.registerPath({
  method: "get",
  path: "/complaints/{id}",
  tags: [COMPLAINTS_TAG],
  summary: "Complaint detail and thread",
  description: "Permission `complaint.view`. Comments and status lines oldest first; hidden comments show only the reason; 404 for complaints the caller may not see (C3, Rule 8).",
  security: cookieAuthRead,
  request: { params: z.object({ id: z.uuid() }), query: LocaleQuery },
  responses: { 200: jsonResponse("Complaint", apiSuccessSchema("ComplaintDetailResponse", z.object({ complaint: ComplaintDetailSchema }))), ...readErrors, 404: jsonResponse("NOT_FOUND", ApiErrorSchema) },
});
