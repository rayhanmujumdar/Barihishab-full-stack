import { readJson } from "@/lib/api/body";
import { fieldError } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { reopenMonth } from "@/lib/distribution/close-service";
import { getDistribution } from "@/lib/distribution/distribution-service";
import { isMonthKey } from "@/lib/periods/month";
import { currentPropertyId } from "@/lib/property";
import { ReopenBodySchema } from "./schema";

export const POST = withAuth<{ month: string }>(
  async (req, { auth, params }) => {
    if (!isMonthKey(params.month)) return fieldError("month", "Use YYYY-MM");
    const body = await readJson(req, ReopenBodySchema);
    if (!body.ok) return body.response;
    const propertyId = await currentPropertyId();
    const r = await reopenMonth(propertyId, params.month, body.data.reason, { id: auth.userId, ...requestMeta(req) });
    return r.ok ? ok(await getDistribution(propertyId, params.month, auth.userId)) : failResponse(r);
  },
  { permission: "period.reopen" },
);
