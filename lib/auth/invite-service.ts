// Accept invite (INV-03): the "registration" door of an invite-only app.
import type { Locale } from "@/lib/generated/prisma/client";
import { audit } from "@/lib/audit";
import { now } from "@/lib/clock";
import { prisma } from "@/lib/prisma";
import { displayName, rolesOf } from "@/lib/users/dto";
import { setPassword } from "./credentials";
import { issueSession, type IssuedTokens } from "./issue";
import { checkPassword, type PasswordProblem } from "./password-policy";
import type { SessionMeta } from "./session-service";
import { consumeToken, inspectToken, type Inspection } from "./token-service";

export function inviterName(token: NonNullable<Inspection["token"]>): string {
  return token.createdBy ? displayName(token.createdBy) : "BariHisab";
}

export type AcceptResult =
  | { ok: true; userId: string; tokens: IssuedTokens }
  | { ok: false; code: "TOKEN_EXPIRED" | "TOKEN_USED"; invitedBy?: string }
  | { ok: false; code: "WEAK_PASSWORD"; reason: PasswordProblem };

export async function acceptInvite(
  input: { token: string; password: string; locale: Locale },
  meta: SessionMeta,
): Promise<AcceptResult> {
  const inspection = await inspectToken(input.token, "INVITE");
  if (inspection.status === "EXPIRED") {
    return { ok: false, code: "TOKEN_EXPIRED", invitedBy: inspection.token ? inviterName(inspection.token) : undefined };
  }
  if (inspection.status === "USED" || inspection.token.user.status !== "INVITED") return { ok: false, code: "TOKEN_USED" };

  const { token } = inspection;
  const user = token.user;
  const policy = checkPassword(input.password, { username: user.username, email: user.email });
  if (!policy.ok) return { ok: false, code: "WEAK_PASSWORD", reason: policy.reason };

  return prisma.$transaction(async (tx) => {
    if (!(await consumeToken(tx, token.id))) return { ok: false as const, code: "TOKEN_USED" as const };
    await setPassword(tx, user.id, input.password);
    const t = now();
    const updated = await tx.user.update({
      where: { id: user.id },
      data: { status: "ACTIVE", locale: input.locale, emailVerified: true, passwordChangedAt: t, lastLoginAt: t, failedLoginCount: 0, lockedUntil: null },
      include: { roles: true },
    });
    await audit(tx, {
      actorId: user.id,
      action: "auth.invite.accepted",
      entityType: "user",
      entityId: user.id,
      before: { status: "INVITED" },
      after: { status: "ACTIVE", locale: input.locale },
      ...meta,
    });
    const tokens = await issueSession(tx, { id: user.id, tokenVersion: updated.tokenVersion, roles: rolesOf(updated) }, { remember: false, ...meta });
    return { ok: true as const, userId: user.id, tokens };
  });
}
