import { readJson } from "@/lib/api/body";
import { apiError, fieldError } from "@/lib/api/errors";
import { COOKIE, readCookie } from "@/lib/auth/cookies";
import { withAuth } from "@/lib/auth/guard";
import { withAuthCookies } from "@/lib/auth/issue";
import { PASSWORD_MESSAGES } from "@/lib/auth/password-policy";
import { changePassword } from "@/lib/auth/password-service";
import { requestMeta } from "@/lib/auth/request-meta";
import { ChangePasswordBodySchema } from "./schema";

export const POST = withAuth(
  async (req, { auth }) => {
    const body = await readJson(req, ChangePasswordBodySchema);
    if (!body.ok) return body.response;
    const result = await changePassword(
      { userId: auth.userId, sessionId: auth.sessionId, refreshToken: readCookie(req, COOKIE.refresh), ...body.data },
      requestMeta(req),
    );
    if (!result.ok) {
      if (result.code === "WEAK_PASSWORD") return fieldError("newPassword", PASSWORD_MESSAGES[result.reason], { reason: result.reason });
      if (result.code === "ACCOUNT_LOCKED") return apiError("ACCOUNT_LOCKED", { details: { retryAfter: result.retryAfter } });
      return apiError("INVALID_CREDENTIALS", { details: { fields: { currentPassword: "Current password is wrong." } } });
    }
    return withAuthCookies(new Response(null, { status: 204 }), result.tokens);
  },
  { permission: "profile.password.self", strict: true },
);
