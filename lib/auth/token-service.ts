// Single-use INVITE (72 h) and RESET (1 h) tokens (Auth PRD §6, §8 Tokens).
// The raw token exists only in the email link; the DB holds its SHA-256.
import type { AuthToken, AuthTokenType, Prisma, User } from "@/lib/generated/prisma/client";
import { HOUR, addMs, now } from "@/lib/clock";
import { prisma } from "@/lib/prisma";
import { generateOpaqueToken, hashToken, safeEqual } from "./tokens";

export const INVITE_TTL_MS = 72 * HOUR;
export const RESET_TTL_MS = 1 * HOUR;

const TTL: Record<AuthTokenType, number> = { INVITE: INVITE_TTL_MS, RESET: RESET_TTL_MS };

type Tx = Prisma.TransactionClient;

export async function revokeOpenTokens(tx: Tx, userId: string, type?: AuthTokenType): Promise<number> {
  const res = await tx.authToken.updateMany({
    where: { userId, usedAt: null, revokedAt: null, ...(type ? { type } : {}) },
    data: { revokedAt: now() },
  });
  return res.count;
}

/** Revokes older open tokens of the same type, then issues a new one. Returns the raw token. */
export async function issueToken(
  tx: Tx,
  input: { userId: string; type: AuthTokenType; createdById: string | null },
): Promise<string> {
  await revokeOpenTokens(tx, input.userId, input.type);
  const raw = generateOpaqueToken();
  const t = now();
  await tx.authToken.create({
    data: {
      userId: input.userId,
      type: input.type,
      tokenHash: hashToken(raw),
      expiresAt: addMs(t, TTL[input.type]),
      createdById: input.createdById,
      createdAt: t,
    },
  });
  return raw;
}

export type TokenWithUser = AuthToken & {
  user: User;
  createdBy: Pick<User, "firstName" | "lastName" | "name" | "username"> | null;
};

export type Inspection =
  | { status: "VALID"; token: TokenWithUser }
  | { status: "EXPIRED"; token: TokenWithUser | null }
  | { status: "USED"; token: TokenWithUser };

export async function inspectToken(raw: string, type: AuthTokenType, db: Tx | typeof prisma = prisma): Promise<Inspection> {
  const hash = hashToken(raw ?? "");
  const token = await db.authToken.findUnique({
    where: { tokenHash: hash },
    include: { user: true, createdBy: { select: { firstName: true, lastName: true, name: true, username: true } } },
  });
  // Unknown and wrong-type tokens look exactly like expired ones (no enumeration).
  if (!token || token.type !== type || !safeEqual(token.tokenHash, hash)) return { status: "EXPIRED", token: null };
  if (token.usedAt || token.revokedAt) return { status: "USED", token };
  if (token.expiresAt <= now()) return { status: "EXPIRED", token };
  return { status: "VALID", token };
}

/** Marks a token used; false if someone else consumed or revoked it first. */
export async function consumeToken(tx: Tx, tokenId: string): Promise<boolean> {
  const res = await tx.authToken.updateMany({
    where: { id: tokenId, usedAt: null, revokedAt: null, expiresAt: { gt: now() } },
    data: { usedAt: now() },
  });
  return res.count === 1;
}
