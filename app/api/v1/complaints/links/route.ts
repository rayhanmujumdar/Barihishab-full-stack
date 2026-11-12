import { connection } from "next/server";
import { parse, searchParams } from "@/lib/api/body";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { linkOptions } from "@/lib/complaints/links";
import { can } from "@/lib/permissions";
import { currentPropertyId } from "@/lib/property";
import { LinkOptionsQuerySchema } from "./schema";

export const GET = withAuth(
  async (req, { auth }) => {
    await connection();
    const query = parse(LinkOptionsQuerySchema, searchParams(req));
    if (!query.ok) return query.response;
    const { type, q, locale } = query.data;
    const items = await linkOptions(await currentPropertyId(), type, q ?? "", locale ?? "en", { userId: auth.userId, requestViewAll: can(auth, "request.view.all") });
    return ok({ items }, { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "complaint.create" },
);
