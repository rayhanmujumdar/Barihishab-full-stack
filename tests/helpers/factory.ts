import type { Locale, Role, UserStatus } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { setPassword } from "@/lib/auth/credentials";

let seq = 0;

export const DEFAULT_PASSWORD = "Gh7!tree-river";

export async function createProperty() {
  return prisma.property.create({ data: { name: "Test House" } });
}

export async function createUser(
  opts: {
    username?: string;
    email?: string;
    roles?: Role[];
    status?: UserStatus;
    password?: string | null;
    locale?: Locale;
    phone?: string;
    firstName?: string;
  } = {},
) {
  seq += 1;
  const username = opts.username ?? `user${seq}_${Date.now() % 100000}`;
  const user = await prisma.user.create({
    data: {
      username,
      displayUsername: username,
      email: opts.email ?? `${username}@example.com`,
      name: opts.firstName ?? username,
      firstName: opts.firstName ?? username,
      status: opts.status ?? "ACTIVE",
      locale: opts.locale ?? "en",
      phone: opts.phone,
      roles: { create: (opts.roles ?? ["OWNER"]).map((role) => ({ role })) },
    },
    include: { roles: true },
  });
  const password = opts.password === undefined ? DEFAULT_PASSWORD : opts.password;
  if (password) await prisma.$transaction((tx) => setPassword(tx, user.id, password));
  return user;
}
