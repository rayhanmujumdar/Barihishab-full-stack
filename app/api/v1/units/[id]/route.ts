import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { updateUnit } from "@/lib/master-data/unit-service";
import { currentPropertyId } from "@/lib/property";
import { PatchUnitBodySchema } from "../schema";

export const PATCH = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const body = await readJson(req, PatchUnitBodySchema);
    if (!body.ok) return body.response;
    const r = await updateUnit(await currentPropertyId(), params.id, body.data, { id: auth.userId, ...requestMeta(req) });
    return r.ok ? ok({ unit: r.unit }) : failResponse(r);
  },
  { permission: "unit.manage" },
);
