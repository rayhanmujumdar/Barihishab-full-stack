import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { ActiveQuery, idParam, KindSchema, NameSchema, readErrors, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth, cookieAuthRead } from "@/lib/api/schemas";
import { registry } from "../registry";

export const CategorySchema = z
  .object({
    id: z.uuid(),
    kind: KindSchema,
    code: z.string().meta({ example: "ELEC" }),
    nameEn: z.string(),
    nameBn: z.string(),
    isSystem: z.boolean(),
    isActive: z.boolean(),
    sortOrder: z.number().int(),
  })
  .meta({ id: "Category" });

export const CreateCategoryBodySchema = z
  .object({ kind: KindSchema, nameEn: NameSchema, nameBn: NameSchema, sortOrder: z.number().int().min(0).max(10000).optional() })
  .strict()
  .meta({ id: "CreateCategoryBody" });
export const PatchCategoryBodySchema = z
  .object({
    kind: KindSchema.optional(),
    nameEn: NameSchema.optional(),
    nameBn: NameSchema.optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(10000).optional(),
  })
  .strict()
  .meta({ id: "PatchCategoryBody" });
export const ListCategoriesQuerySchema = z.object({ kind: KindSchema.optional(), active: ActiveQuery });
export const CategoryEnvelopeSchema = z.object({ category: CategorySchema }).meta({ id: "CategoryEnvelope" });

registry.registerPath({
  method: "get",
  path: "/categories",
  tags: ["Master data"],
  summary: "List income / expense categories",
  description: "Permission `transaction.view`.",
  security: cookieAuthRead,
  request: { query: ListCategoriesQuerySchema },
  responses: {
    200: jsonResponse("Categories", apiSuccessSchema("CategoryListResponse", z.object({ items: z.array(CategorySchema) }))),
    ...readErrors,
  },
});

registry.registerPath({
  method: "post",
  path: "/categories",
  tags: ["Master data"],
  summary: "Add a category",
  description: "Permission `category.manage`. The code is generated.",
  security: cookieAuth,
  request: { body: { content: { "application/json": { schema: CreateCategoryBodySchema } } } },
  responses: { 201: jsonResponse("Created", apiSuccessSchema("CreateCategoryResponse", CategoryEnvelopeSchema)), ...writeErrors },
});

registry.registerPath({
  method: "patch",
  path: "/categories/{id}",
  tags: ["Master data"],
  summary: "Rename or deactivate a category (system categories are locked)",
  description: "Permission `category.manage`.",
  security: cookieAuth,
  request: { params: idParam, body: { content: { "application/json": { schema: PatchCategoryBodySchema } } } },
  responses: {
    200: jsonResponse("Updated", apiSuccessSchema("PatchCategoryResponse", CategoryEnvelopeSchema)),
    ...writeErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
    409: jsonResponse("CATEGORY_LOCKED", ApiErrorSchema),
  },
});
