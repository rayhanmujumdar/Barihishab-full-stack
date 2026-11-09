import { connection } from "next/server";
import { apiError, fieldError } from "@/lib/api/errors";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { getClosePreview } from "@/lib/distribution/distribution-service";
import { isMonthKey } from "@/lib/periods/month";
import { currentPropertyId } from "@/lib/property";

export const GET = withAuth<{ month: string }>(
  async (_req, { params }) => {
    await connection();
    if (!isMonthKey(params.month)) return fieldError("month", "Use YYYY-MM");
    const data = await getClosePreview(await currentPropertyId(), params.month);
    return data ? ok(data, { headers: { "Cache-Control": "no-store" } }) : apiError("NOT_FOUND");
  },
  { permission: "period.close" },
);
