import { connection } from "next/server";
import { parse, readJson, searchParams } from "@/lib/api/body";
import { withIdempotency } from "@/lib/api/idempotency";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { listLoans } from "@/lib/loans/loan-read";
import { createLoan } from "@/lib/loans/loan-service";
import { currentPropertyId } from "@/lib/property";
import { CreateLoanBodySchema, ListLoansQuerySchema } from "./schema";

export const GET = withAuth(
  async (req) => {
    await connection();
    const query = parse(ListLoansQuerySchema, searchParams(req));
    if (!query.ok) return query.response;
    return ok(await listLoans(await currentPropertyId(), query.data), { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "loan.view" },
);

export const POST = withAuth(
  async (req, { auth }) => {
    const body = await readJson(req, CreateLoanBodySchema);
    if (!body.ok) return body.response;
    const propertyId = await currentPropertyId();
    return withIdempotency(req, propertyId, auth.userId, body.data, async (save) => {
      const r = await createLoan(propertyId, body.data, { id: auth.userId, ...requestMeta(req) }, save);
      return r.ok ? ok({ loan: r.loan, warnings: r.warnings }, { status: 201 }) : failResponse(r);
    });
  },
  { permission: "loan.create" },
);
