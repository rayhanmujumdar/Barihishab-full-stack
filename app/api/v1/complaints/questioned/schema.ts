import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { readErrors } from "@/lib/api/money-schemas";
import { cookieAuthRead } from "@/lib/api/schemas";
import { registry } from "../../registry";
import { COMPLAINTS_TAG, LinkTypeSchema } from "../schema";

export const QuestionedQuerySchema = z.object({
  type: LinkTypeSchema,
  ids: z
    .string()
    .transform((s) => s.split(",").filter(Boolean))
    .pipe(z.array(z.uuid()).max(200, "At most 200 ids")),
});

registry.registerPath({
  method: "get",
  path: "/complaints/questioned",
  tags: [COMPLAINTS_TAG],
  summary: "Which items are being questioned",
  description: "Permission `complaint.view`. For each id with a visible Open or In review complaint about it, the newest such complaint's id (C8, G10).",
  security: cookieAuthRead,
  request: { query: z.object({ type: LinkTypeSchema, ids: z.string().meta({ description: "Comma-separated uuids (≤ 200)" }) }) },
  responses: {
    200: jsonResponse("Questioned", apiSuccessSchema("ComplaintQuestionedResponse", z.object({ items: z.record(z.string(), z.uuid()).meta({ description: "item id → complaint id" }) }))),
    ...readErrors,
    422: jsonResponse("VALIDATION_FAILED", ApiErrorSchema),
  },
});
