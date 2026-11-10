import { connection } from "next/server";
import { readJson } from "@/lib/api/body";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { loadAdvanceLimit, saveAdvanceLimit } from "@/lib/loans/settings-service";
import { prisma } from "@/lib/prisma";
import { currentPropertyId } from "@/lib/property";
import { AdvanceLimitBodySchema } from "./schema";

export const GET = withAuth(
  async () => {
    await connection();
    return ok(await loadAdvanceLimit(prisma, await currentPropertyId()), { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "settings.manage" },
);

export const PUT = withAuth(
  async (req, { auth }) => {
    const body = await readJson(req, AdvanceLimitBodySchema);
    if (!body.ok) return body.response;
    const r = await saveAdvanceLimit(await currentPropertyId(), body.data, { id: auth.userId, ...requestMeta(req) });
    return r.ok ? ok({ multiplierPct: r.multiplierPct }) : failResponse(r);
  },
  { permission: "settings.manage" },
);
