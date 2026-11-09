import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { IdempotencyHeader, MonthKeySchema, readErrors, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth, cookieAuthRead } from "@/lib/api/schemas";
import { registry } from "../../registry";

export const ShareSetSchema = z
  .object({
    id: z.uuid(),
    effectiveMonth: MonthKeySchema,
    reason: z.string(),
    savedBy: z.string(),
    savedAt: z.iso.datetime(),
    replaced: z.boolean().meta({ description: "A later save for the same month replaced this set" }),
    totalUnits: z.number().int(),
    items: z.array(z.object({ ownerId: z.uuid(), displayName: z.string(), units: z.number().int(), sharePercent: z.number() })),
  })
  .meta({ id: "ShareSet" });

export const SaveShareSetBodySchema = z
  .object({
    effectiveMonth: MonthKeySchema,
    reason: z.string().trim().min(1, "A reason is required for every share change.").max(300, "At most 300 characters"),
    items: z
      .array(z.object({ ownerId: z.uuid(), units: z.number({ error: "Whole units only" }).int("Whole units only").min(0, "Whole units only").max(1_000_000) }).strict())
      .min(1, "Total share units must be above zero.")
      .max(200),
  })
  .strict()
  .meta({ id: "SaveShareSetBody" });

registry.registerPath({
  method: "get",
  path: "/owners/shares",
  tags: ["Owners"],
  summary: "House share timeline (every share set, newest first)",
  description: "Permission `owner.view`. Replaced same-month sets are included with `replaced: true`.",
  security: cookieAuthRead,
  responses: {
    200: jsonResponse("Share sets", apiSuccessSchema("ShareSetListResponse", z.object({ items: z.array(ShareSetSchema) }))),
    ...readErrors,
  },
});

registry.registerPath({
  method: "post",
  path: "/owners/shares",
  tags: ["Owners"],
  summary: "Save a new share set (all owners together)",
  description:
    "Permission `share.manage`. Requires `Idempotency-Key`. Effective month: an open month or the month after the latest period, never closed. Owners left out hold 0 units. A second set for the same month replaces the first (kept in history).",
  security: cookieAuth,
  request: { headers: IdempotencyHeader, body: { content: { "application/json": { schema: SaveShareSetBodySchema } } } },
  responses: {
    201: jsonResponse("Saved", apiSuccessSchema("SaveShareSetResponse", z.object({ shareSet: ShareSetSchema }))),
    ...writeErrors,
    409: jsonResponse("PERIOD_CLOSED / IDEMPOTENCY_CONFLICT", ApiErrorSchema),
  },
});
