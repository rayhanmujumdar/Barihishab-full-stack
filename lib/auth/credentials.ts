// The only module that talks to better-auth internals (design risk: keep
// upgrade fallout in one file). Reads go through better-auth's internal
// adapter; writes that must share a DB transaction with audit/outbox rows use
// the caller's Prisma `tx` with a hash produced by better-auth's hasher.
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "./better-auth";
import { dummyHash, needsRehash } from "./hash";

const CREDENTIAL = "credential";

type Tx = Prisma.TransactionClient;

async function ctx() {
  return auth.$context;
}

/** Username or email, case-insensitive (citext columns). */
export function findUserByIdentifier(identifier: string) {
  const value = identifier.trim();
  if (!value) return Promise.resolve(null);
  return prisma.user.findFirst({
    where: value.includes("@") ? { email: value } : { username: value },
    include: { roles: true },
  });
}

export async function getPasswordHash(userId: string): Promise<string | null> {
  const { internalAdapter } = await ctx();
  const accounts = await internalAdapter.findAccounts(userId);
  return accounts.find((a) => a.providerId === CREDENTIAL)?.password ?? null;
}

export async function hasPassword(userId: string, tx: Tx = prisma): Promise<boolean> {
  const n = await tx.account.count({ where: { userId, providerId: CREDENTIAL, password: { not: null } } });
  return n > 0;
}

/**
 * Verifies a password for a user id. Always runs one Argon2 verification —
 * against a dummy hash when the user has no password — so timing does not
 * reveal whether an account (or its password) exists.
 */
export async function verifyUserPassword(
  userId: string | null,
  password: string,
): Promise<{ valid: boolean; rehash: boolean }> {
  const c = await ctx();
  const stored = userId ? await getPasswordHash(userId) : null;
  const valid = await c.password.verify({ hash: stored ?? (await dummyHash()), password });
  return { valid: Boolean(stored) && valid, rehash: Boolean(stored) && valid && needsRehash(stored!) };
}

export async function hashForStorage(password: string): Promise<string> {
  const c = await ctx();
  return c.password.hash(password);
}

/** Creates or replaces the user's credential account inside `tx`. */
export async function setPassword(tx: Tx, userId: string, password: string): Promise<void> {
  const hash = await hashForStorage(password);
  const existing = await tx.account.findFirst({ where: { userId, providerId: CREDENTIAL } });
  if (existing) {
    await tx.account.update({ where: { id: existing.id }, data: { password: hash } });
  } else {
    await tx.account.create({
      data: { userId, providerId: CREDENTIAL, accountId: userId, password: hash },
    });
  }
}
