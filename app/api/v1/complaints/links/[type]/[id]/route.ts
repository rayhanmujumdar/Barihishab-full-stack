import { connection } from "next/server";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { localeOf } from "@/lib/complaints/actor";
import { LINK_TYPES, linkOption, type LinkType } from "@/lib/complaints/links";
import { can } from "@/lib/permissions";
import { currentPropertyId } from "@/lib/property";

export const GET = withAuth<{ type: string; id: string }>(
  async (req, { auth, params }) => {
    await connection();
    if (!isUuid(params.id) || !(LINK_TYPES as readonly string[]).includes(params.type)) return apiError("NOT_FOUND");
    const item = await linkOption(await currentPropertyId(), { type: params.type as LinkType, id: params.id }, localeOf(req), { userId: auth.userId, requestViewAll: can(auth, "request.view.all") });
    return item ? ok({ item }, { headers: { "Cache-Control": "no-store" } }) : apiError("NOT_FOUND");
  },
  { permission: "complaint.create" },
);
