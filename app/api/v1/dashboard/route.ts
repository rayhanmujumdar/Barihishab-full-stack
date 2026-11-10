import { connection } from "next/server";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { todayIsoInDhaka } from "@/lib/clock";
import { dashboard } from "@/lib/home/dashboard";
import { hiddenToday, readCookie } from "@/lib/home/hidden";
import { currentPropertyId } from "@/lib/property";

/** Role-aware Home summary for any logged-in user (Home PRD §3; main PRD §9 GET /dashboard). */
export const GET = withAuth(async (req, { auth }) => {
  await connection();
  const hidden = hiddenToday(readCookie(req.headers.get("cookie")), todayIsoInDhaka());
  const data = await dashboard(await currentPropertyId(), { id: auth.userId, permissions: auth.permissions }, { hidden });
  return ok(data, { headers: { "Cache-Control": "no-store" } });
});
