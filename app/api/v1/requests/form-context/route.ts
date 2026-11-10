import { connection } from "next/server";
import { parse, searchParams } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { currentPropertyId } from "@/lib/property";
import { formContext } from "@/lib/requests/context-service";
import { FormContextQuerySchema } from "./schema";

export const GET = withAuth(
  async (req, { auth }) => {
    await connection();
    const query = parse(FormContextQuerySchema, searchParams(req));
    if (!query.ok) return query.response;
    const propertyId = await currentPropertyId();
    const own = await prisma.owner.findFirst({ where: { propertyId, userId: auth.userId }, select: { id: true } });
    const ownerId = query.data.ownerId ?? own?.id;
    if (!ownerId) return apiError("NO_OWNER_PROFILE");
    if (ownerId !== own?.id && !can(auth, "request.record")) return apiError("FORBIDDEN");
    const data = await formContext(propertyId, ownerId, query.data.amountPaisa ?? null);
    return data ? ok(data, { headers: { "Cache-Control": "no-store" } }) : apiError("NOT_FOUND");
  },
  { permission: "request.create" },
);
