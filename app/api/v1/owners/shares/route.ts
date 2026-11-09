import { connection } from "next/server";
import { readJson } from "@/lib/api/body";
import { withIdempotency } from "@/lib/api/idempotency";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { listShareSets, saveShareSet } from "@/lib/owners/share-service";
import { currentPropertyId } from "@/lib/property";
import { SaveShareSetBodySchema } from "./schema";

export const GET = withAuth(
  async () => {
    await connection();
    return ok({ items: await listShareSets(await currentPropertyId()) }, { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "owner.view" },
);

export const POST = withAuth(
  async (req, { auth }) => {
    const body = await readJson(req, SaveShareSetBodySchema);
    if (!body.ok) return body.response;
    const propertyId = await currentPropertyId();
    return withIdempotency(req, propertyId, auth.userId, body.data, async (save) => {
      const r = await saveShareSet(propertyId, body.data, { id: auth.userId, ...requestMeta(req) }, save);
      return r.ok ? ok({ shareSet: r.shareSet }, { status: 201 }) : failResponse(r);
    });
  },
  { permission: "share.manage" },
);
