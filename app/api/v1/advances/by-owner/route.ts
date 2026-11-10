import { connection } from "next/server";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { standingByOwner } from "@/lib/loans/advance-service";
import { currentPropertyId } from "@/lib/property";

export const GET = withAuth(
  async () => {
    await connection();
    return ok(await standingByOwner(await currentPropertyId()), { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "loan.view" },
);
