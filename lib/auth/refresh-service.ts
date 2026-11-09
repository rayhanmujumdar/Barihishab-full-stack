// Exchanges a refresh token for a new access + refresh pair (design D2).
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { rolesOf } from "@/lib/users/dto";
import { issueAccessFor, type IssuedTokens } from "./issue";
import { rotateSession, type SessionMeta } from "./session-service";

export type RefreshResult = { ok: true; userId: string; tokens: IssuedTokens } | { ok: false };

export async function refreshTokens(refreshToken: string | null, meta: SessionMeta): Promise<RefreshResult> {
  if (!refreshToken) return { ok: false };
  const rotated = await rotateSession({ refreshToken, ...meta });
  if (!rotated.ok) {
    if (rotated.reason === "REUSED" && rotated.userId) {
      // A stolen refresh token was replayed: every session in the family is gone.
      await audit(prisma, {
        actorId: null,
        action: "auth.logout_all",
        entityType: "user",
        entityId: rotated.userId,
        reason: "refresh_reuse",
        ...meta,
      });
    }
    return { ok: false };
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: rotated.userId }, include: { roles: true } });
  const tokens = await issueAccessFor(
    { id: user.id, tokenVersion: user.tokenVersion, roles: rolesOf(user) },
    rotated.session.id,
    rotated.refreshToken,
    rotated.session.remember,
  );
  return { ok: true, userId: user.id, tokens };
}
