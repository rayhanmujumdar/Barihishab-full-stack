import { connection } from "next/server";
import { parse, readJson, searchParams } from "@/lib/api/body";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { listNotices } from "@/lib/notices/notice-read";
import { publishNotice } from "@/lib/notices/notice-service";
import { can } from "@/lib/permissions";
import { currentPropertyId } from "@/lib/property";
import { ListNoticesQuerySchema, PublishNoticeBodySchema } from "./schema";

export const GET = withAuth(
  async (req, { auth }) => {
    await connection();
    const query = parse(ListNoticesQuerySchema, searchParams(req));
    if (!query.ok) return query.response;
    const list = await listNotices(await currentPropertyId(), { userId: auth.userId, manage: can(auth, "notice.manage") }, query.data);
    return ok(list, { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "notice.view" },
);

export const POST = withAuth(
  async (req, { auth }) => {
    const body = await readJson(req, PublishNoticeBodySchema);
    if (!body.ok) return body.response;
    const r = await publishNotice(await currentPropertyId(), body.data, { id: auth.userId, ...requestMeta(req) });
    return r.ok ? ok({ notice: r.notice, emailed: r.emailed }, { status: 201 }) : failResponse(r);
  },
  { permission: "notice.manage" },
);
