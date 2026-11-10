import { z } from "zod";
import { apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { readErrors, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth, cookieAuthRead } from "@/lib/api/schemas";
import { registry } from "../../registry";

export const AdvanceLimitBodySchema = z
  .object({ multiplierPct: z.union([z.literal(50), z.literal(100), z.literal(150), z.literal(200)], { error: "Pick 0.5×, 1×, 1.5× or 2×." }).meta({ description: "% of the last 3 closed months' average entitlement" }) })
  .strict()
  .meta({ id: "AdvanceLimitSettings" });

const Response = apiSuccessSchema("AdvanceLimitResponse", AdvanceLimitBodySchema);

registry.registerPath({
  method: "get",
  path: "/settings/advance-limit",
  tags: ["Advances & loans"],
  summary: "The advance-limit rule",
  description: "Permission `settings.manage`. Default 1× (100) (F14, SET-02).",
  security: cookieAuthRead,
  responses: { 200: jsonResponse("Rule", Response), ...readErrors },
});

registry.registerPath({
  method: "put",
  path: "/settings/advance-limit",
  tags: ["Advances & loans"],
  summary: "Save the advance-limit rule",
  description: "Permission `settings.manage`. One of 50, 100, 150, 200. Audited as `settings.advance_limit_updated`.",
  security: cookieAuth,
  request: { body: { content: { "application/json": { schema: AdvanceLimitBodySchema } } } },
  responses: { 200: jsonResponse("Saved", Response), ...writeErrors },
});
