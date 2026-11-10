import { connection } from "next/server";
import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { loanDetail } from "@/lib/loans/loan-read";
import { setLoanInstallment } from "@/lib/loans/loan-service";
import { currentPropertyId } from "@/lib/property";
import { PatchLoanBodySchema } from "./schema";

export const GET = withAuth<{ id: string }>(
  async (_req, { params }) => {
    await connection();
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const detail = await loanDetail(await currentPropertyId(), params.id);
    return detail ? ok(detail, { headers: { "Cache-Control": "no-store" } }) : apiError("NOT_FOUND");
  },
  { permission: "loan.view" },
);

export const PATCH = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const body = await readJson(req, PatchLoanBodySchema);
    if (!body.ok) return body.response;
    const r = await setLoanInstallment(await currentPropertyId(), params.id, body.data, { id: auth.userId, ...requestMeta(req) });
    return r.ok ? ok({ loan: r.loan, expectedFinishMonth: r.expectedFinishMonth }) : failResponse(r);
  },
  { permission: "loan.manage" },
);
