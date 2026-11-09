import { connection } from "next/server";
import { apiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { withPublic } from "@/lib/auth/guard";
import { limitByIp } from "@/lib/auth/rate-guard";
import { inspectToken } from "@/lib/auth/token-service";

export const GET = withPublic<{ token: string }>(async (req, { params }) => {
  await connection();
  const limited = await limitByIp(req);
  if (limited) return limited;
  const inspection = await inspectToken(params.token, "RESET");
  if (inspection.status === "VALID" && inspection.token.user.status === "ACTIVE") {
    return ok({ valid: true as const }, { headers: { "Cache-Control": "no-store" } });
  }
  return apiError(inspection.status === "EXPIRED" ? "TOKEN_EXPIRED" : "TOKEN_USED");
});
