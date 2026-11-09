import { readJson } from "@/lib/api/body";
import { fieldError } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { setReserveOverride } from "@/lib/distribution/reserve-service";
import { isMonthKey } from "@/lib/periods/month";
import { currentPropertyId } from "@/lib/property";
import { ReserveOverrideBodySchema } from "./schema";

export const PUT = withAuth<{ month: string }>(
  async (req, { auth, params }) => {
    if (!isMonthKey(params.month)) return fieldError("month", "Use YYYY-MM");
    const body = await readJson(req, ReserveOverrideBodySchema);
    if (!body.ok) return body.response;
    const r = await setReserveOverride(await currentPropertyId(), params.month, body.data, { id: auth.userId, ...requestMeta(req) });
    return r.ok ? ok({ month: r.month, overridePaisa: r.overridePaisa, overrideReason: r.overrideReason }) : failResponse(r);
  },
  { permission: "reserve.override" },
);
