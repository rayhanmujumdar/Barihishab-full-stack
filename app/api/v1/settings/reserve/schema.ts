import { z } from "zod";
import { apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { readErrors, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth, cookieAuthRead } from "@/lib/api/schemas";
import { registry } from "../../registry";

const starting = z.number().int().min(0, "Can't be negative.").max(1_000_000_000, "At most ৳1 crore.").meta({ description: "Reserve the house already holds (paisa)" });

export const ReserveSettingsBodySchema = z
  .discriminatedUnion("mode", [
    z.object({ mode: z.literal("OFF"), startingPaisa: starting }).strict(),
    z
      .object({
        mode: z.literal("PERCENT"),
        percentBp: z.number().int().min(1, "Between 0.01% and 100%.").max(10000, "Between 0.01% and 100%.").meta({ description: "Basis points: 500 = 5%" }),
        startingPaisa: starting,
      })
      .strict(),
    z.object({ mode: z.literal("FIXED"), fixedPaisa: z.number().int().min(1, "Enter an amount.").max(1_000_000_000, "At most ৳1 crore."), startingPaisa: starting }).strict(),
  ])
  .meta({ id: "ReserveSettings" });

export const ReserveSettingsResultSchema = z
  .object({ rule: ReserveSettingsBodySchema, balancePaisa: z.number().int().meta({ description: "Starting + reserve of closed months − reserve-paid expenses" }) })
  .meta({ id: "ReserveSettingsResult" });

registry.registerPath({
  method: "get",
  path: "/settings/reserve",
  tags: ["Distribution"],
  summary: "Reserve rule and reserve balance",
  description: "Permission `settings.manage` (Distribution PRD F9, SET-02).",
  security: cookieAuthRead,
  responses: { 200: jsonResponse("Reserve", apiSuccessSchema("ReserveSettingsResponse", ReserveSettingsResultSchema)), ...readErrors },
});

registry.registerPath({
  method: "put",
  path: "/settings/reserve",
  tags: ["Distribution"],
  summary: "Save the reserve rule",
  description: "Permission `settings.manage`. Off, a percent of (income − expense) when positive (rounded to whole taka), or a fixed amount per month. Closed months keep their snapshot.",
  security: cookieAuth,
  request: { body: { content: { "application/json": { schema: ReserveSettingsBodySchema } } } },
  responses: { 200: jsonResponse("Saved", apiSuccessSchema("ReserveSettingsSaved", ReserveSettingsResultSchema)), ...writeErrors },
});
