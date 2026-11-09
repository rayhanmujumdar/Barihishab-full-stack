import { connection } from "next/server";
import { apiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { withPublic } from "@/lib/auth/guard";
import { inviterName } from "@/lib/auth/invite-service";
import { limitByIp } from "@/lib/auth/rate-guard";
import { inspectToken } from "@/lib/auth/token-service";
import { displayName } from "@/lib/users/dto";

export const GET = withPublic<{ token: string }>(async (req, { params }) => {
  await connection();
  const limited = await limitByIp(req);
  if (limited) return limited;

  const inspection = await inspectToken(params.token, "INVITE");
  if (inspection.status === "EXPIRED") {
    return apiError("TOKEN_EXPIRED", {
      details: inspection.token ? { invitedBy: inviterName(inspection.token) } : undefined,
    });
  }
  if (inspection.status === "USED" || inspection.token.user.status !== "INVITED") return apiError("TOKEN_USED");

  const { token } = inspection;
  return ok(
    {
      firstName: token.user.firstName ?? displayName(token.user),
      username: token.user.username,
      invitedBy: inviterName(token),
      expiresAt: token.expiresAt.toISOString(),
      locale: token.user.locale,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});
