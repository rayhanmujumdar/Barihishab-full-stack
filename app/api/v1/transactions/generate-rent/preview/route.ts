import { readJson } from "@/lib/api/body";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { currentPropertyId } from "@/lib/property";
import { previewRent } from "@/lib/transactions/transaction-service";
import { PreviewBodySchema } from "../schema";

export const POST = withAuth(
  async (req) => {
    const body = await readJson(req, PreviewBodySchema);
    if (!body.ok) return body.response;
    const r = await previewRent(await currentPropertyId(), body.data.period);
    return r.ok ? ok({ period: r.period, rows: r.rows }, { headers: { "Cache-Control": "no-store" } }) : failResponse(r);
  },
  { permission: "transaction.create" },
);
