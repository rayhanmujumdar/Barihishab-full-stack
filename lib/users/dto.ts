// The only shape in which a user leaves the API. Never includes password
// hashes, tokens, lockout counters or token_version.
import type { Role as DbRole, User, UserRole } from "@/lib/generated/prisma/client";
import { permissionsFor, type Role } from "@/lib/permissions";

export type PublicUser = {
  id: string;
  username: string;
  email: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  surname: string | null;
  birthday: string | null;
  profession: string | null;
  phone: string | null;
  whatsapp: string | null;
  whatsappSameAsPhone: boolean;
  houseResponsibility: string | null;
  locale: "bn" | "en";
  status: "INVITED" | "ACTIVE" | "INACTIVE";
  roles: Role[];
  lastLoginAt: string | null;
  createdAt: string;
};

export function rolesOf(user: { roles: Pick<UserRole, "role">[] }): Role[] {
  return [...new Set(user.roles.map((r) => r.role as DbRole as Role))];
}

export function toPublicUser(user: User & { roles: Pick<UserRole, "role">[] }): PublicUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    surname: user.surname,
    birthday: user.birthday ? user.birthday.toISOString().slice(0, 10) : null,
    profession: user.profession,
    phone: user.phone,
    whatsapp: user.whatsapp,
    whatsappSameAsPhone: user.whatsappSameAsPhone,
    houseResponsibility: user.houseResponsibility,
    locale: user.locale,
    status: user.status,
    roles: rolesOf(user),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

export function sessionPayload(user: User & { roles: Pick<UserRole, "role">[] }) {
  const roles = rolesOf(user);
  return { user: toPublicUser(user), roles, permissions: permissionsFor(roles) };
}

export function displayName(u: Pick<User, "firstName" | "lastName" | "name" | "username">): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || u.name || u.username;
}
