import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { cookieAuth, cookieAuthRead, PublicUserSchema, RoleSchema } from "@/lib/api/schemas";
import { emailField, enabledRoleField, localeField, profileFields, usernameField } from "@/lib/validation/user-fields";
import { registry } from "../registry";

export const CreateUserBodySchema = z
  .object({
    ...profileFields,
    username: usernameField,
    email: emailField,
    role: enabledRoleField,
    locale: localeField.default("bn"),
  })
  .strict()
  .meta({ id: "CreateUserBody" });

export const ListUsersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  role: RoleSchema.optional(),
  status: z.enum(["INVITED", "ACTIVE", "INACTIVE"]).optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const UserListSchema = z
  .object({
    items: z.array(PublicUserSchema),
    nextCursor: z.uuid().nullable(),
    activeSuperAdminCount: z.number().int().meta({ description: "Used by the UI to disable deactivate/demote on the last active Super Admin" }),
  })
  .meta({ id: "UserList" });

export const UserEnvelopeSchema = z.object({ user: PublicUserSchema }).meta({ id: "UserEnvelope" });

const errors = {
  401: jsonResponse("UNAUTHENTICATED", ApiErrorSchema),
  403: jsonResponse("FORBIDDEN / CSRF_INVALID", ApiErrorSchema),
};

registry.registerPath({
  method: "get",
  path: "/users",
  tags: ["Users"],
  summary: "List users (search, role & status filters, cursor pagination)",
  description: "Permission `user.list`.",
  security: cookieAuthRead,
  request: { query: ListUsersQuerySchema },
  responses: { 200: jsonResponse("Users", apiSuccessSchema("UserListResponse", UserListSchema)), ...errors },
});

registry.registerPath({
  method: "post",
  path: "/users",
  tags: ["Users"],
  summary: "Create a user and send the invite",
  description: "Permission `user.create`. The user starts INVITED; an invite email (72 h link) is queued.",
  security: cookieAuth,
  request: { body: { content: { "application/json": { schema: CreateUserBodySchema } } } },
  responses: {
    201: jsonResponse("Created", apiSuccessSchema("CreateUserResponse", UserEnvelopeSchema)),
    ...errors,
    409: jsonResponse("USERNAME_TAKEN / EMAIL_TAKEN", ApiErrorSchema),
    422: jsonResponse("VALIDATION_FAILED", ApiErrorSchema),
  },
});
