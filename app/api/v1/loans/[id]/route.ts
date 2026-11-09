import { readJson } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { setLoanInstallment } from "@/lib/owners/loan-service";
import { currentPropertyId } from "@/lib/property";
import { PatchLoanBodySchema } from "./schema";

export const PATCH = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const body = await readJson(req, PatchLoanBodySchema);
    if (!body.ok) return body.response;
    const r = await setLoanInstallment(await currentPropertyId(), params.id, body.data.installmentPaisa, { id: auth.userId, ...requestMeta(req) });
    return r.ok ? ok({ loan: r.loan }) : failResponse(r);
  },
  { permission: "loan.manage" },
);
