import { connection } from "next/server";
import { parse, searchParams } from "@/lib/api/body";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { currentPropertyId } from "@/lib/property";
import { fundsReport } from "@/lib/reports/funds";
import { FundsQuerySchema } from "./schema";

export const GET = withAuth(
  async (req) => {
    await connection();
    const query = parse(FundsQuerySchema, searchParams(req));
    if (!query.ok) return query.response;
    const { month, year } = query.data;
    const data = await fundsReport(await currentPropertyId(), month ? { kind: "month", month } : { kind: "year", year: Number(year) });
    return ok(data, { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "report.view" },
);
