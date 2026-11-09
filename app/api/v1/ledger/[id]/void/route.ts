import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { voidLedgerEntry } from "@/lib/owners/ledger-service";
import { currentPropertyId } from "@/lib/property";
import { VoidLedgerBodySchema } from "./schema";

export const POST = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const body = await readJson(req, VoidLedgerBodySchema);
    if (!body.ok) return body.response;
    const r = await voidLedgerEntry(await currentPropertyId(), params.id, body.data.reason, { id: auth.userId, ...requestMeta(req) });
    return r.ok ? ok({ entry: r.entry, reversal: r.reversal, balancePaisa: r.balancePaisa }) : failResponse(r);
  },
  { permission: "ledger.void" },
);
