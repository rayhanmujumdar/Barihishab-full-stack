import { connection } from "next/server";
import { parse, searchParams } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { getDistribution } from "@/lib/distribution/distribution-service";
import { currentPropertyId } from "@/lib/property";
import { DistributionQuerySchema } from "./schema";

export const GET = withAuth(
  async (req, { auth }) => {
    await connection();
    const query = parse(DistributionQuerySchema, searchParams(req));
    if (!query.ok) return query.response;
    const data = await getDistribution(await currentPropertyId(), query.data.month ?? null, auth.userId);
    return data ? ok(data, { headers: { "Cache-Control": "no-store" } }) : apiError("NOT_FOUND");
  },
  { permission: "distribution.view" },
);
