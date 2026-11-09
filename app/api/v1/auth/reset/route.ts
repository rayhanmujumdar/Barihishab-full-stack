import { readJson } from "@/lib/api/body";
import { apiError, fieldError } from "@/lib/api/errors";
import { withPublic } from "@/lib/auth/guard";
import { withAuthCookies } from "@/lib/auth/issue";
import { PASSWORD_MESSAGES } from "@/lib/auth/password-policy";
import { resetPassword } from "@/lib/auth/password-service";
import { limitByIp } from "@/lib/auth/rate-guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { ResetBodySchema } from "./schema";

export const POST = withPublic(async (req) => {
  const limited = await limitByIp(req);
  if (limited) return limited;
  const body = await readJson(req, ResetBodySchema);
  if (!body.ok) return body.response;

  const result = await resetPassword(body.data, requestMeta(req));
  if (!result.ok) {
    if (result.code === "WEAK_PASSWORD") return fieldError("password", PASSWORD_MESSAGES[result.reason], { reason: result.reason });
    return apiError(result.code);
  }
  return withAuthCookies(new Response(null, { status: 204 }), result.tokens);
});
