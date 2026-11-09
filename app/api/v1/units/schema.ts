import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { ActiveQuery, idParam, NameSchema, readErrors, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth, cookieAuthRead } from "@/lib/api/schemas";
import { MAX_AMOUNT_PAISA } from "@/lib/money";
import { registry } from "../registry";

export const UnitSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    tenantName: z.string().nullable(),
    rentPaisa: z.number().int(),
    defaultFundAccountId: z.uuid().nullable(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
  })
  .meta({ id: "Unit" });

const fields = {
  name: NameSchema,
  tenantName: z.string().trim().max(100).nullable().optional(),
  rentPaisa: z.number().int().min(0).max(MAX_AMOUNT_PAISA),
  defaultFundAccountId: z.uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
};

export const CreateUnitBodySchema = z.object(fields).strict().meta({ id: "CreateUnitBody" });
export const PatchUnitBodySchema = z
  .object({ ...fields, name: fields.name.optional(), rentPaisa: fields.rentPaisa.optional(), isActive: z.boolean().optional() })
  .strict()
  .meta({ id: "PatchUnitBody" });
export const ListUnitsQuerySchema = z.object({ active: ActiveQuery });
export const UnitEnvelopeSchema = z.object({ unit: UnitSchema }).meta({ id: "UnitEnvelope" });

registry.registerPath({
  method: "get",
  path: "/units",
  tags: ["Master data"],
  summary: "List units (flats / shops)",
  description: "Permission `transaction.view`.",
  security: cookieAuthRead,
  request: { query: ListUnitsQuerySchema },
  responses: { 200: jsonResponse("Units", apiSuccessSchema("UnitListResponse", z.object({ items: z.array(UnitSchema) }))), ...readErrors },
});

registry.registerPath({
  method: "post",
  path: "/units",
  tags: ["Master data"],
  summary: "Add a unit",
  description: "Permission `unit.manage`.",
  security: cookieAuth,
  request: { body: { content: { "application/json": { schema: CreateUnitBodySchema } } } },
  responses: {
    201: jsonResponse("Created", apiSuccessSchema("CreateUnitResponse", UnitEnvelopeSchema)),
    ...writeErrors,
    409: jsonResponse("NAME_TAKEN", ApiErrorSchema),
  },
});

registry.registerPath({
  method: "patch",
  path: "/units/{id}",
  tags: ["Master data"],
  summary: "Edit or deactivate a unit (never deleted)",
  description: "Permission `unit.manage`.",
  security: cookieAuth,
  request: { params: idParam, body: { content: { "application/json": { schema: PatchUnitBodySchema } } } },
  responses: {
    200: jsonResponse("Updated", apiSuccessSchema("PatchUnitResponse", UnitEnvelopeSchema)),
    ...writeErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
    409: jsonResponse("NAME_TAKEN", ApiErrorSchema),
  },
});
