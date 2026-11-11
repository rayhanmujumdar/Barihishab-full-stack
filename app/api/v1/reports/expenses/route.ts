import { connection } from "next/server";
import { parse } from "@/lib/api/body";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { currentPropertyId } from "@/lib/property";
import { expenseAnalysis } from "@/lib/reports/expenses";
import { queryObject } from "@/lib/reports/params";
import { ExpensesQuerySchema } from "./schema";

export const GET = withAuth(
  async (req) => {
    await connection();
    const query = parse(ExpensesQuerySchema, queryObject(req.url, ["categoryId"]));
    if (!query.ok) return query.response;
    const { from, to, categoryId } = query.data;
    return ok(await expenseAnalysis(await currentPropertyId(), from, to, categoryId), { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "report.view" },
);
