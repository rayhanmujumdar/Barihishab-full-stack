import { readJson } from "@/lib/api/body";
import { ok } from "@/lib/api/response";
import { withPublic } from "@/lib/auth/guard";
import { requestPasswordReset } from "@/lib/auth/password-service";
import { limitByIp } from "@/lib/auth/rate-guard";
import { FORGOT_MESSAGE, ForgotBodySchema } from "./schema";

export const POST = withPublic(async (req) => {
  const limited = await limitByIp(req);
  if (limited) return limited;
  const body = await readJson(req, ForgotBodySchema);
  if (!body.ok) return body.response;
  await requestPasswordReset(body.data.email);
  return ok({ message: FORGOT_MESSAGE }, { status: 202 });
});
