import { readJson } from "@/lib/api/body";
import { withIdempotency } from "@/lib/api/idempotency";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { createAdvance } from "@/lib/owners/ledger-service";
import { currentPropertyId } from "@/lib/property";
import { AdvanceBodySchema } from "./schema";

export const POST = withAuth(
  async (req, { auth }) => {
    const body = await readJson(req, AdvanceBodySchema);
    if (!body.ok) return body.response;
    const propertyId = await currentPropertyId();
    return withIdempotency(req, propertyId, auth.userId, body.data, async (save) => {
      const r = await createAdvance(propertyId, body.data, { id: auth.userId, ...requestMeta(req) }, save);
      return r.ok ? ok({ entry: r.entry, balancePaisa: r.balancePaisa, warnings: r.warnings }, { status: 201 }) : failResponse(r);
    });
  },
  { permission: "advance.create" },
);
