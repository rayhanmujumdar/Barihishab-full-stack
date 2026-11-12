import { connection } from "next/server";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { whoRead } from "@/lib/notices/notice-read";
import { currentPropertyId } from "@/lib/property";

export const GET = withAuth<{ id: string }>(
  async (_req, { params }) => {
    await connection();
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const r = await whoRead(await currentPropertyId(), params.id);
    return r ? ok(r, { headers: { "Cache-Control": "no-store" } }) : apiError("NOT_FOUND");
  },
  { permission: "notice.manage" },
);
