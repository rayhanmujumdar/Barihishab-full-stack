// Shared OpenAPI/zod response schemas for the auth & user modules.
import { z } from "zod";
import { ALL_PERMISSIONS, ROLES } from "@/lib/permissions";

export const RoleSchema = z.enum(ROLES).meta({ id: "Role" });
export const PermissionSchema = z.enum(ALL_PERMISSIONS).meta({ id: "Permission" });

export const PublicUserSchema = z
  .object({
    id: z.uuid(),
    username: z.string().meta({ example: "rahim" }),
    email: z.email(),
    name: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    surname: z.string().nullable(),
    birthday: z.iso.date().nullable(),
    profession: z.string().nullable(),
    phone: z.string().nullable(),
    whatsapp: z.string().nullable(),
    whatsappSameAsPhone: z.boolean(),
    houseResponsibility: z.string().nullable(),
    locale: z.enum(["bn", "en"]),
    status: z.enum(["INVITED", "ACTIVE", "INACTIVE"]),
    roles: z.array(RoleSchema),
    lastLoginAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "PublicUser" });

export const SessionPayloadSchema = z
  .object({
    user: PublicUserSchema,
    roles: z.array(RoleSchema),
    permissions: z.array(PermissionSchema),
    csrfToken: z.string().optional(),
  })
  .meta({ id: "SessionPayload" });

export const cookieAuth = [{ cookieAuth: [], csrfHeader: [] }];
export const cookieAuthRead = [{ cookieAuth: [] }];
