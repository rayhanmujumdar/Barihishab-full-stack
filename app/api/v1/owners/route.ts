import { connection } from "next/server";
import { readJson } from "@/lib/api/body";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { createOwner, listOwners } from "@/lib/owners/owner-service";
import { currentPropertyId } from "@/lib/property";
import { CreateOwnerBodySchema } from "./schema";

export const GET = withAuth(
  async (_req, { auth }) => {
    await connection();
    return ok(await listOwners(await currentPropertyId(), auth.userId), { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "owner.view" },
);

export const POST = withAuth(
  async (req, { auth }) => {
    const body = await readJson(req, CreateOwnerBodySchema);
    if (!body.ok) return body.response;
    const r = await createOwner(await currentPropertyId(), body.data, { id: auth.userId, ...requestMeta(req) });
    return r.ok ? ok({ owner: r.owner }, { status: 201 }) : failResponse(r);
  },
  { permission: "owner.manage" },
);
