import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { readErrors } from "@/lib/api/money-schemas";
import { cookieAuthRead } from "@/lib/api/schemas";
import { registry } from "../../registry";
import { COMPLAINTS_TAG, LinkItemSchema, LinkTypeSchema, LocaleQuery } from "../schema";

export const LinkOptionSchema = LinkItemSchema.extend({ prefill: z.string().meta({ example: "Question about Electricity · October 2026" }) }).meta({ id: "ComplaintLinkOption" });
export const LinkOptionsQuerySchema = LocaleQuery.extend({ type: LinkTypeSchema, q: z.string().max(100).optional() });

registry.registerPath({
  method: "get",
  path: "/complaints/links",
  tags: [COMPLAINTS_TAG],
  summary: "Search items a complaint can link to",
  description: "Permission `complaint.create`. Up to 20 items of one type the caller may see, newest first, with the pre-filled title (C2, G9).",
  security: cookieAuthRead,
  request: { query: LinkOptionsQuerySchema },
  responses: { 200: jsonResponse("Options", apiSuccessSchema("ComplaintLinkOptionsResponse", z.object({ items: z.array(LinkOptionSchema) }))), ...readErrors, 422: jsonResponse("VALIDATION_FAILED", ApiErrorSchema) },
});
