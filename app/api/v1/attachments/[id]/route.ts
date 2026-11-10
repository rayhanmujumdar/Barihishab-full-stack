import { connection } from "next/server";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { fileMeta } from "@/lib/attachments/attachment-service";
import { withAuth } from "@/lib/auth/guard";
import { can } from "@/lib/permissions";
import { currentPropertyId } from "@/lib/property";

export const GET = withAuth<{ id: string }>(
  async (_req, { auth, params }) => {
    await connection();
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const meta = await fileMeta(await currentPropertyId(), params.id, { userId: auth.userId, viewAll: can(auth, "request.view.all") });
    return meta ? ok(meta, { headers: { "Cache-Control": "no-store" } }) : apiError("NOT_FOUND");
  },
  { permission: "attachment.view" },
);
