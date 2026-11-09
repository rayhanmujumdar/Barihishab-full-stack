import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { updateFund } from "@/lib/master-data/fund-service";
import { currentPropertyId } from "@/lib/property";
import { PatchFundBodySchema } from "../schema";

export const PATCH = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const body = await readJson(req, PatchFundBodySchema);
    if (!body.ok) return body.response;
    const r = await updateFund(await currentPropertyId(), params.id, body.data, { id: auth.userId, ...requestMeta(req) });
    return r.ok ? ok({ fundAccount: r.fundAccount }) : failResponse(r);
  },
  { permission: "fund.manage" },
);
