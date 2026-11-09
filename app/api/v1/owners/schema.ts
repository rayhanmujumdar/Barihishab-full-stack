import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { MonthKeySchema, readErrors, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth, cookieAuthRead } from "@/lib/api/schemas";
import { registry } from "../registry";

// ─── Shared shapes (also imported by the owners sub-routes' schema.ts) ───

export const DisplayNameSchema = z.string().trim().min(1, "Enter a name.").max(80, "At most 80 characters");
export const InitialsSchema = z.string().trim().min(1, "1–3 letters").max(3, "1–3 letters");
export const SortOrderSchema = z.number().int().min(0).max(10000);
export const BalanceLabelSchema = z.enum(["OWED", "ADVANCE", "SETTLED"]).meta({ id: "BalanceLabel" });

export const OwnerSchema = z
  .object({
    id: z.uuid(),
    userId: z.uuid().nullable(),
    displayName: z.string(),
    initials: z.string(),
    sortOrder: z.number().int(),
    note: z.string().nullable(),
    responsibility: z.string().nullable(),
    units: z.number().int(),
    sharePercent: z.number().meta({ description: "Full precision; display with 1 decimal" }),
    status: z.enum(["current", "former", "new"]),
    leftMonth: MonthKeySchema.nullable(),
    tags: z.object({ superAdmin: z.boolean(), invitePending: z.boolean(), noLogin: z.boolean() }),
    isViewer: z.boolean(),
    balancePaisa: z.number().int().meta({ description: "+ owed by the house, − advance outstanding" }),
    balanceLabel: BalanceLabelSchema,
    loanOutstandingPaisa: z.number().int(),
  })
  .meta({ id: "Owner" });

// ─── This route ───

export const CreateOwnerBodySchema = z
  .object({
    userId: z.uuid().optional(),
    displayName: DisplayNameSchema.optional(),
    initials: InitialsSchema.optional(),
    sortOrder: SortOrderSchema.optional(),
  })
  .strict()
  .refine((b) => b.userId || b.displayName, { path: ["displayName"], message: "Enter a name." })
  .meta({ id: "CreateOwnerBody" });

registry.registerPath({
  method: "get",
  path: "/owners",
  tags: ["Owners"],
  summary: "Owner list: shares, balances and loans in force today",
  description: "Permission `owner.view`. `owners` = current and new owners; `formerOwners` = owners now at 0 units. Sorted by display order.",
  security: cookieAuthRead,
  responses: {
    200: jsonResponse(
      "Owners",
      apiSuccessSchema(
        "OwnerListResponse",
        z.object({ houseName: z.string(), totalUnits: z.number().int(), owners: z.array(OwnerSchema), formerOwners: z.array(OwnerSchema) }),
      ),
    ),
    ...readErrors,
  },
});

registry.registerPath({
  method: "post",
  path: "/owners",
  tags: ["Owners"],
  summary: "Add an owner (linked user or name only)",
  description: "Permission `owner.manage`. Starts with 0 units; give units through `POST /owners/shares`.",
  security: cookieAuth,
  request: { body: { content: { "application/json": { schema: CreateOwnerBodySchema } } } },
  responses: {
    201: jsonResponse("Created", apiSuccessSchema("CreateOwnerResponse", z.object({ owner: OwnerSchema }))),
    ...writeErrors,
    409: jsonResponse("USER_ALREADY_OWNER", ApiErrorSchema),
  },
});
