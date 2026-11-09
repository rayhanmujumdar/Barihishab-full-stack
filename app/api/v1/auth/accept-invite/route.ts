import { readJson } from "@/lib/api/body";
import { apiError, fieldError } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { withPublic } from "@/lib/auth/guard";
import { acceptInvite } from "@/lib/auth/invite-service";
import { appendLocaleCookie } from "@/lib/auth/cookies";
import { withAuthCookies } from "@/lib/auth/issue";
import { PASSWORD_MESSAGES } from "@/lib/auth/password-policy";
import { limitByIp } from "@/lib/auth/rate-guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { prisma } from "@/lib/prisma";
import { sessionPayload } from "@/lib/users/dto";
import { AcceptInviteBodySchema } from "./schema";

export const POST = withPublic(async (req) => {
  const limited = await limitByIp(req);
  if (limited) return limited;
  const body = await readJson(req, AcceptInviteBodySchema);
  if (!body.ok) return body.response;

  const result = await acceptInvite(body.data, requestMeta(req));
  if (!result.ok) {
    if (result.code === "WEAK_PASSWORD") return fieldError("password", PASSWORD_MESSAGES[result.reason], { reason: result.reason });
    return apiError(result.code, { details: "invitedBy" in result && result.invitedBy ? { invitedBy: result.invitedBy } : undefined });
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: result.userId }, include: { roles: true } });
  const res = ok({ ...sessionPayload(user), csrfToken: result.tokens.csrfToken }, { headers: { "Cache-Control": "no-store" } });
  appendLocaleCookie(res.headers, user.locale);
  return withAuthCookies(res, result.tokens);
});
