import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { cookieAuth, cookieAuthRead, PublicUserSchema, RoleSchema } from "@/lib/api/schemas";
import { avatarIdField, emailField, enabledRoleField, localeField, profileFields, usernameField } from "@/lib/validation/user-fields";
import { FAILURE_CODES } from "@/lib/email/errors";
import { registry } from "../registry";

export const CreateUserBodySchema = z
  .object({
    ...profileFields,
    username: usernameField,
    email: emailField,
    role: enabledRoleField,
    locale: localeField.default("bn"),
    avatarId: avatarIdField,
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

export const InviteEmailStateSchema = z
  .object({
    status: z.enum(["QUEUED", "SENT", "FAILED"]),
    queuedAt: z.iso.datetime(),
    sentAt: z.iso.datetime().nullable(),
    failureCode: z.enum(FAILURE_CODES).nullable(),
  })
  .meta({ id: "InviteEmailState", description: "Delivery state of the user's latest invite email. Codes only — never addresses or provider text." });

export const UserListItemSchema = PublicUserSchema.extend({
  inviteEmail: InviteEmailStateSchema.nullable().meta({ description: "Latest invite email for INVITED users; null for everyone else" }),
}).meta({ id: "UserListItem" });

export const UserListSchema = z
  .object({
    items: z.array(UserListItemSchema),
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
  description: "Permission `user.create`. The user starts INVITED; an invite email (72 h link) is queued. Optional `avatarId` (from POST /avatars/presign) attaches a profile photo in the same transaction.",
  security: cookieAuth,
  request: { body: { content: { "application/json": { schema: CreateUserBodySchema } } } },
  responses: {
    201: jsonResponse("Created", apiSuccessSchema("CreateUserResponse", UserEnvelopeSchema)),
    ...errors,
    409: jsonResponse("USERNAME_TAKEN / EMAIL_TAKEN", ApiErrorSchema),
    422: jsonResponse("VALIDATION_FAILED", ApiErrorSchema),
  },
});
