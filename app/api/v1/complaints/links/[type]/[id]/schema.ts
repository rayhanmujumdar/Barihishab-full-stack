import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { readErrors } from "@/lib/api/money-schemas";
import { cookieAuthRead } from "@/lib/api/schemas";
import { registry } from "../../../../registry";
import { COMPLAINTS_TAG, LinkTypeSchema, LocaleQuery } from "../../../schema";
import { LinkOptionSchema } from "../../schema";

registry.registerPath({
  method: "get",
  path: "/complaints/links/{type}/{id}",
  tags: [COMPLAINTS_TAG],
  summary: "One linkable item (Raise an objection pre-fill)",
  description: "Permission `complaint.create`. 404 when the item doesn't exist or the caller may not see it (C2).",
  security: cookieAuthRead,
  request: { params: z.object({ type: LinkTypeSchema, id: z.uuid() }), query: LocaleQuery },
  responses: { 200: jsonResponse("Item", apiSuccessSchema("ComplaintLinkOptionResponse", z.object({ item: LinkOptionSchema }))), ...readErrors, 404: jsonResponse("NOT_FOUND", ApiErrorSchema) },
});
