import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { currentPropertyId } from "@/lib/property";
import { markDecisionsSeen } from "@/lib/requests/request-read";

export const POST = withAuth(async (_req, { auth }) => ok({ cleared: await markDecisionsSeen(await currentPropertyId(), auth.userId) }), { permission: "request.view" });
