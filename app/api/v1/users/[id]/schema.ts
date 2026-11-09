import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { cookieAuth, cookieAuthRead, PublicUserSchema, RoleSchema } from "@/lib/api/schemas";
import { identityFields, profileFields } from "@/lib/validation/user-fields";
import { registry } from "../../registry";
import { UserEnvelopeSchema } from "../schema";

export const PatchUserBodySchema = z.object({ ...profileFields, ...identityFields }).strict().meta({ id: "PatchUserBody" });
export const UserDetailSchema = z
  .object({ user: PublicUserSchema, roles: z.array(RoleSchema), lastLoginAt: z.iso.datetime().nullable() })
  .meta({ id: "UserDetail" });

export const idParam = z.object({ id: z.uuid() });
const errors = {
  401: jsonResponse("UNAUTHENTICATED", ApiErrorSchema),
  403: jsonResponse("FORBIDDEN / CSRF_INVALID", ApiErrorSchema),
  404: jsonResponse("NOT_FOUND", ApiErrorSchema),
};

registry.registerPath({
  method: "get",
  path: "/users/{id}",
  tags: ["Users"],
  summary: "Get one user",
  description: "Permission `user.list`.",
  security: cookieAuthRead,
  request: { params: idParam },
  responses: { 200: jsonResponse("User", apiSuccessSchema("UserDetailResponse", UserDetailSchema)), ...errors },
});

registry.registerPath({
  method: "patch",
  path: "/users/{id}",
  tags: ["Users"],
  summary: "Edit a user (any field, incl. username/email)",
  description: "Permission `user.update`.",
  security: cookieAuth,
  request: { params: idParam, body: { content: { "application/json": { schema: PatchUserBodySchema } } } },
  responses: {
    200: jsonResponse("Updated", apiSuccessSchema("PatchUserResponse", UserEnvelopeSchema)),
    ...errors,
    409: jsonResponse("USERNAME_TAKEN / EMAIL_TAKEN", ApiErrorSchema),
    422: jsonResponse("VALIDATION_FAILED", ApiErrorSchema),
  },
});

export const ReasonBodySchema = z
  .object({ reason: z.string().trim().min(1, "A reason is required").max(500) })
  .meta({ id: "ReasonBody" });
export const RolesBodySchema = z
  .object({ roles: z.array(z.enum(["SUPER_ADMIN", "OWNER"], "Choose Super Admin or Owner")).min(1, "Pick at least one role") })
  .meta({ id: "RolesBody" });

registry.registerPath({
  method: "put",
  path: "/users/{id}/roles",
  tags: ["Users"],
  summary: "Replace a user's roles",
  description: "Permission `user.update`. Revokes the user's sessions. 409 LAST_SUPER_ADMIN / CANNOT_REMOVE_OWN_ADMIN.",
  security: cookieAuth,
  request: { params: idParam, body: { content: { "application/json": { schema: RolesBodySchema } } } },
  responses: {
    200: jsonResponse("Roles changed", apiSuccessSchema("RolesResponse", UserEnvelopeSchema)),
    ...errors,
    409: jsonResponse("LAST_SUPER_ADMIN / CANNOT_REMOVE_OWN_ADMIN", ApiErrorSchema),
    422: jsonResponse("VALIDATION_FAILED", ApiErrorSchema),
  },
});

for (const [path, summary, desc] of [
  ["/users/{id}/deactivate", "Deactivate a user (reason required)", "Permission `user.deactivate`. Revokes all sessions and open tokens. 409 LAST_SUPER_ADMIN."],
  ["/users/{id}/reactivate", "Reactivate a user (reason required)", "Permission `user.deactivate`. Becomes ACTIVE if a password exists, else INVITED."],
] as const) {
  registry.registerPath({
    method: "post",
    path,
    tags: ["Users"],
    summary,
    description: desc,
    security: cookieAuth,
    request: { params: idParam, body: { content: { "application/json": { schema: ReasonBodySchema } } } },
    responses: {
      200: jsonResponse("Done", apiSuccessSchema(`${path.split("/").pop()}Response`, UserEnvelopeSchema)),
      ...errors,
      409: jsonResponse("LAST_SUPER_ADMIN", ApiErrorSchema),
      422: jsonResponse("VALIDATION_FAILED", ApiErrorSchema),
    },
  });
}

registry.registerPath({
  method: "post",
  path: "/users/{id}/resend-invite",
  tags: ["Users"],
  summary: "Resend the invite (old link dies)",
  description: "Permission `user.invite.resend`.",
  security: cookieAuth,
  request: { params: idParam },
  responses: { 202: { description: "New invite queued" }, ...errors, 409: jsonResponse("NOT_INVITED", ApiErrorSchema) },
});

registry.registerPath({
  method: "post",
  path: "/users/{id}/revoke-invite",
  tags: ["Users"],
  summary: "Revoke the invite link",
  description: "Permission `user.invite.resend`.",
  security: cookieAuth,
  request: { params: idParam },
  responses: { 204: { description: "Revoked" }, ...errors },
});

registry.registerPath({
  method: "post",
  path: "/users/{id}/revoke-sessions",
  tags: ["Users"],
  summary: "Log a user out everywhere",
  description: "Permission `user.session.revoke`.",
  security: cookieAuth,
  request: { params: idParam },
  responses: { 204: { description: "All sessions revoked" }, ...errors },
});
