import { connection } from "next/server";
import { readJson } from "@/lib/api/body";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { getReserveSettings, saveReserveSettings } from "@/lib/distribution/reserve-service";
import { currentPropertyId } from "@/lib/property";
import { ReserveSettingsBodySchema } from "./schema";

export const GET = withAuth(
  async () => {
    await connection();
    return ok(await getReserveSettings(await currentPropertyId()), { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "settings.manage" },
);

export const PUT = withAuth(
  async (req, { auth }) => {
    const body = await readJson(req, ReserveSettingsBodySchema);
    if (!body.ok) return body.response;
    const r = await saveReserveSettings(await currentPropertyId(), body.data, { id: auth.userId, ...requestMeta(req) });
    return r.ok ? ok({ rule: r.rule, balancePaisa: r.balancePaisa }) : failResponse(r);
  },
  { permission: "settings.manage" },
);
