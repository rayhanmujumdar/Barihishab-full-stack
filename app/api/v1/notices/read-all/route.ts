import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { markAllRead } from "@/lib/notices/notice-service";
import { currentPropertyId } from "@/lib/property";

export const POST = withAuth(async (_req, { auth }) => ok(await markAllRead(await currentPropertyId(), auth.userId)), { permission: "notice.view" });
