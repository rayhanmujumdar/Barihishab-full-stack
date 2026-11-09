import { connection } from "next/server";
import { parse, searchParams } from "@/lib/api/body";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { currentPropertyId } from "@/lib/property";
import { vendorSuggestions } from "@/lib/transactions/transaction-service";
import { VendorQuerySchema } from "./schema";

export const GET = withAuth(
  async (req) => {
    await connection();
    const query = parse(VendorQuerySchema, searchParams(req));
    if (!query.ok) return query.response;
    return ok({ items: await vendorSuggestions(await currentPropertyId(), query.data.q) }, { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "transaction.create" },
);
