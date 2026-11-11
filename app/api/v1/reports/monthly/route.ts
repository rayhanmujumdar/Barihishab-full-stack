import { connection } from "next/server";
import { parse, searchParams } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { currentPropertyId } from "@/lib/property";
import { csvDownload } from "@/lib/reports/http";
import { monthlyCsv, monthlyFileName, monthlyReport } from "@/lib/reports/monthly";
import { MonthlyQuerySchema } from "./schema";

export const GET = withAuth(
  async (req) => {
    await connection();
    const query = parse(MonthlyQuerySchema, searchParams(req));
    if (!query.ok) return query.response;
    const data = await monthlyReport(await currentPropertyId(), query.data.month ?? null);
    if (!data) return apiError("NOT_FOUND");
    if (query.data.format === "csv") {
      if (data.month === null) return apiError("NOT_FOUND");
      return csvDownload(monthlyCsv(data), monthlyFileName(data, "csv"));
    }
    return ok(data, { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "report.view" },
);
