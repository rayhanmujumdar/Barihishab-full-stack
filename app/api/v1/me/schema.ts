import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { cookieAuth, cookieAuthRead, PermissionSchema, PublicUserSchema, RoleSchema } from "@/lib/api/schemas";
import { identityFields, profileFields } from "@/lib/validation/user-fields";
import { registry } from "../registry";

export const MeSchema = z
  .object({ profile: PublicUserSchema, roles: z.array(RoleSchema), permissions: z.array(PermissionSchema) })
  .meta({ id: "Me" });

export const PatchMeBodySchema = z.object({ ...profileFields, ...identityFields }).strict().meta({ id: "PatchMeBody" });

registry.registerPath({
  method: "get",
  path: "/me",
  tags: ["Me"],
  summary: "My profile, roles and permissions",
  security: cookieAuthRead,
  responses: {
    200: jsonResponse("Profile", apiSuccessSchema("MeResponse", MeSchema)),
    401: jsonResponse("UNAUTHENTICATED", ApiErrorSchema),
  },
});

registry.registerPath({
  method: "patch",
  path: "/me",
  tags: ["Me"],
  summary: "Update my profile",
  description: "Requires `profile.update.self`. Changing `email` or `username` also requires `profile.identity.self` (Super Admin only).",
  security: cookieAuth,
  request: { body: { content: { "application/json": { schema: PatchMeBodySchema } } } },
  responses: {
    200: jsonResponse("Updated", apiSuccessSchema("PatchMeResponse", MeSchema)),
    401: jsonResponse("UNAUTHENTICATED", ApiErrorSchema),
    403: jsonResponse("FORBIDDEN / CSRF_INVALID", ApiErrorSchema),
    409: jsonResponse("USERNAME_TAKEN / EMAIL_TAKEN", ApiErrorSchema),
    422: jsonResponse("VALIDATION_FAILED", ApiErrorSchema),
  },
});
