import { connection } from "next/server";
import { parse, searchParams } from "@/lib/api/body";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { currentPropertyId } from "@/lib/property";
import { csvDownload } from "@/lib/reports/http";
import { yearlyCsv, yearlyFileName, yearlyReport } from "@/lib/reports/yearly";
import { YearlyQuerySchema } from "./schema";

export const GET = withAuth(
  async (req) => {
    await connection();
    const query = parse(YearlyQuerySchema, searchParams(req));
    if (!query.ok) return query.response;
    const data = await yearlyReport(await currentPropertyId(), query.data.year ? Number(query.data.year) : null);
    if (query.data.format === "csv") return csvDownload(yearlyCsv(data), yearlyFileName(data, "csv"));
    return ok(data, { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "report.view" },
);
