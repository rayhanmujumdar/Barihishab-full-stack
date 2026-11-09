import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { withPublic } from "@/lib/auth/guard";
import { appendLocaleCookie } from "@/lib/auth/cookies";
import { withAuthCookies } from "@/lib/auth/issue";
import { login } from "@/lib/auth/login-service";
import { LIMITS } from "@/lib/auth/rate-limit";
import { limitBy, limitByIp } from "@/lib/auth/rate-guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { prisma } from "@/lib/prisma";
import { sessionPayload } from "@/lib/users/dto";
import { LoginBodySchema } from "./schema";

export const POST = withPublic(async (req) => {
  const ipLimited = await limitByIp(req);
  if (ipLimited) return ipLimited;

  const body = await readJson(req, LoginBodySchema);
  if (!body.ok) return body.response;

  const idLimited = await limitBy(LIMITS.loginPerIdentifier, body.data.identifier);
  if (idLimited) return idLimited;

  const result = await login(body.data, requestMeta(req));
  if (!result.ok) {
    if (result.code === "ACCOUNT_LOCKED") {
      return apiError("ACCOUNT_LOCKED", { details: { retryAfter: result.retryAfter } });
    }
    return apiError("INVALID_CREDENTIALS", {
      details: result.attemptsLeft === undefined ? undefined : { attemptsLeft: result.attemptsLeft },
    });
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: result.userId }, include: { roles: true } });
  const res = ok({ ...sessionPayload(user), csrfToken: result.tokens.csrfToken }, { headers: { "Cache-Control": "no-store" } });
  appendLocaleCookie(res.headers, user.locale);
  return withAuthCookies(res, result.tokens);
});
