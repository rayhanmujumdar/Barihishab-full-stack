import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { setOpening } from "@/lib/owners/ledger-service";
import { currentPropertyId } from "@/lib/property";
import { OpeningBodySchema } from "./schema";

export const PUT = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const body = await readJson(req, OpeningBodySchema);
    if (!body.ok) return body.response;
    const r = await setOpening(await currentPropertyId(), params.id, body.data, { id: auth.userId, ...requestMeta(req) });
    return r.ok ? ok({ entry: r.entry, balancePaisa: r.balancePaisa }) : failResponse(r);
  },
  { permission: "owner.manage" },
);
