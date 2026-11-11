import { connection } from "next/server";
import { parse, searchParams } from "@/lib/api/body";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { currentPropertyId } from "@/lib/property";
import { rentRollReport } from "@/lib/reports/rent-roll";
import { RentRollQuerySchema } from "./schema";

export const GET = withAuth(
  async (req) => {
    await connection();
    const query = parse(RentRollQuerySchema, searchParams(req));
    if (!query.ok) return query.response;
    const data = await rentRollReport(await currentPropertyId(), query.data.year ? Number(query.data.year) : null);
    return ok(data, { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "report.view" },
);
