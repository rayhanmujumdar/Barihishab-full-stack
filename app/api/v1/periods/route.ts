import { connection } from "next/server";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { ensureCurrentPeriod, listPeriods } from "@/lib/periods/period-service";
import { currentPropertyId } from "@/lib/property";

export const GET = withAuth(
  async () => {
    await connection();
    const propertyId = await currentPropertyId();
    await ensureCurrentPeriod(propertyId);
    return ok(await listPeriods(propertyId), { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "transaction.view" },
);
