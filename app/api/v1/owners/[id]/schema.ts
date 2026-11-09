import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { idParam, MonthKeySchema, readErrors, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth, cookieAuthRead } from "@/lib/api/schemas";
import { registry } from "../../registry";
import { DisplayNameSchema, InitialsSchema, OwnerSchema, SortOrderSchema } from "../schema";

export const OwnerDetailQuerySchema = z.object({
  year: z.coerce.number().int().min(2000, "Pick a year between 2000 and 2100").max(2100, "Pick a year between 2000 and 2100").optional(),
});

export const PatchOwnerBodySchema = z
  .object({
    displayName: DisplayNameSchema.optional(),
    initials: InitialsSchema.optional(),
    sortOrder: SortOrderSchema.optional(),
    note: z.string().trim().max(200, "At most 200 characters").nullable().optional(),
    userId: z.uuid().nullable().optional().meta({ description: "Link a login, or null to unlink" }),
  })
  .strict()
  .meta({ id: "PatchOwnerBody" });

export const OwnerDetailSchema = OwnerSchema.extend({
  email: z.string().nullable(),
  phone: z.string().nullable(),
  userName: z.string().nullable().meta({ description: "Name of the linked login" }),
  year: z.number().int(),
  entitlementPaisa: z.number().int(),
  paidOutPaisa: z.number().int().meta({ description: "Payouts + advances dated in `year`, voided excluded" }),
  oldestDueMonth: MonthKeySchema.nullable(),
  shareHistory: z.array(
    z.object({
      shareSetId: z.uuid(),
      effectiveMonth: MonthKeySchema,
      units: z.number().int(),
      sharePercent: z.number(),
      reason: z.string(),
      savedBy: z.string(),
      savedAt: z.iso.datetime(),
    }),
  ),
}).meta({ id: "OwnerDetail" });

registry.registerPath({
  method: "get",
  path: "/owners/{id}",
  tags: ["Owners"],
  summary: "Owner detail: summary figures, contact and share history",
  description: "Permission `owner.view`. `year` (default: this year, Asia/Dhaka) drives `entitlementPaisa` and `paidOutPaisa`.",
  security: cookieAuthRead,
  request: { params: idParam, query: OwnerDetailQuerySchema },
  responses: {
    200: jsonResponse("Owner", apiSuccessSchema("OwnerDetailResponse", z.object({ owner: OwnerDetailSchema }))),
    ...readErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
    422: jsonResponse("VALIDATION_FAILED", ApiErrorSchema),
  },
});

registry.registerPath({
  method: "patch",
  path: "/owners/{id}",
  tags: ["Owners"],
  summary: "Edit an owner (name, initials, order, note, linked login)",
  description: "Permission `owner.manage`. Owners are never deleted.",
  security: cookieAuth,
  request: { params: idParam, body: { content: { "application/json": { schema: PatchOwnerBodySchema } } } },
  responses: {
    200: jsonResponse("Updated", apiSuccessSchema("PatchOwnerResponse", z.object({ owner: OwnerSchema }))),
    ...writeErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
    409: jsonResponse("USER_ALREADY_OWNER", ApiErrorSchema),
  },
});
