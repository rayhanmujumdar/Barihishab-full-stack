import { connection } from "next/server";
import { parse, searchParams } from "@/lib/api/body";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { questionedFor } from "@/lib/complaints/questioned";
import { can } from "@/lib/permissions";
import { currentPropertyId } from "@/lib/property";
import { QuestionedQuerySchema } from "./schema";

export const GET = withAuth(
  async (req, { auth }) => {
    await connection();
    const query = parse(QuestionedQuerySchema, searchParams(req));
    if (!query.ok) return query.response;
    const items = await questionedFor(await currentPropertyId(), { userId: auth.userId, viewAll: can(auth, "complaint.view.all") }, query.data.type, query.data.ids);
    return ok({ items }, { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "complaint.view" },
);
