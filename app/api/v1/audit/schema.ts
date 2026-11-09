import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { cookieAuthRead } from "@/lib/api/schemas";
import { registry } from "../registry";

export const AuditQuerySchema = z.object({
  category: z.enum(["auth"]).optional(),
  actorId: z.uuid().optional(),
  entityId: z.string().max(100).optional(),
  cursor: z.string().regex(/^\d{1,18}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const AuditItemSchema = z
  .object({
    id: z.string(),
    actorId: z.uuid().nullable(),
    actorName: z.string().nullable(),
    action: z.string().meta({ example: "auth.login.success" }),
    entityType: z.string(),
    entityId: z.string().nullable(),
    before: z.unknown().nullable(),
    after: z.unknown().nullable(),
    reason: z.string().nullable(),
    ip: z.string().nullable(),
    userAgent: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "AuditItem" });

registry.registerPath({
  method: "get",
  path: "/audit",
  tags: ["Audit"],
  summary: "Audit log (newest first)",
  description: "Permission `audit.view.all`. `category=auth` returns `auth.*` and `user.*` actions.",
  security: cookieAuthRead,
  request: { query: AuditQuerySchema },
  responses: {
    200: jsonResponse(
      "Audit rows",
      apiSuccessSchema("AuditListResponse", z.object({ items: z.array(AuditItemSchema), nextCursor: z.string().nullable() })),
    ),
    401: jsonResponse("UNAUTHENTICATED", ApiErrorSchema),
    403: jsonResponse("FORBIDDEN", ApiErrorSchema),
  },
});
