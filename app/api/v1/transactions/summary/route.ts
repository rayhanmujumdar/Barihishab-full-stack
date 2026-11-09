import { connection } from "next/server";
import { parse, searchParams } from "@/lib/api/body";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { currentPropertyId } from "@/lib/property";
import { periodSummary } from "@/lib/transactions/transaction-service";
import { SummaryQuerySchema } from "./schema";

export const GET = withAuth(
  async (req) => {
    await connection();
    const query = parse(SummaryQuerySchema, searchParams(req));
    if (!query.ok) return query.response;
    return ok(await periodSummary(await currentPropertyId(), query.data.period), { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "transaction.view" },
);
