import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as loans from "@/app/api/v1/loans/[id]/route";
import { loanOutstandingByOwner } from "@/lib/owners/loan-service";
import { prisma } from "@/lib/prisma";
import { createLoan } from "../../helpers/factory";
import { apiRequest, json, params, type Login } from "../../helpers/http";
import { freezeDhaka } from "../../helpers/money";
import { ownersWorld } from "../../helpers/owners";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

const patch = (login: Login, id: string, body: unknown) => loans.PATCH(apiRequest(`/loans/${id}`, { method: "PATCH", login, body }), params({ id }));

async function world() {
  const w = await ownersWorld();
  const loan = (await prisma.loan.findFirstOrThrow({ where: { ownerId: w.owners.tanvir.id } })).id;
  return { ...w, loan };
}

describe("PATCH /api/v1/loans/:id (Distribution F11, ADV-02)", () => {
  it("sets and clears the instalment and audits it", async () => {
    const w = await world();
    const res = await patch(w.adminLogin, w.loan, { installmentPaisa: 500000 });
    expect(res.status).toBe(200);
    expect((await json(res)).data.loan).toMatchObject({ id: w.loan, installmentPaisa: 500000, outstandingPaisa: 3500000, status: "ACTIVE" });
    const row = await prisma.auditLog.findFirstOrThrow({ where: { action: "loan.updated", entityId: w.loan } });
    expect(row.before).toEqual({ installmentPaisa: null });
    expect(row.after).toEqual({ installmentPaisa: 500000 });
    const cleared = await json(await patch(w.adminLogin, w.loan, { installmentPaisa: null }));
    expect(cleared.data.loan.installmentPaisa).toBeNull();
  });

  it("refuses an instalment above the outstanding, a closed loan, an unknown id and an Owner", async () => {
    const w = await world();
    expect((await patch(w.adminLogin, w.loan, { installmentPaisa: 3500001 })).status).toBe(422);
    expect((await patch(w.adminLogin, w.loan, { installmentPaisa: 0 })).status).toBe(422);
    const repaid = await createLoan({ propertyId: w.property.id, ownerId: w.owners.tanvir.id, fundAccountId: w.cash.id, createdById: w.admin.id, principalPaisa: 1000, status: "REPAID" });
    const closed = await patch(w.adminLogin, repaid.id, { installmentPaisa: 100 });
    expect(closed.status).toBe(409);
    expect((await json(closed)).error.code).toBe("LOAN_NOT_ACTIVE");
    expect((await patch(w.adminLogin, randomUUID(), { installmentPaisa: 100 })).status).toBe(404);
    expect((await patch(w.adminLogin, "nope", { installmentPaisa: 100 })).status).toBe(404);
    expect((await patch(w.ownerLogin, w.loan, { installmentPaisa: 100 })).status).toBe(403);
  });

  it("outstanding = principal − loan deductions, voided deductions restore it", async () => {
    const w = await world();
    const d = await w.entry(w.owners.tanvir.id, "LOAN_DEDUCTION", -500000, { loanId: w.loan });
    expect((await loanOutstandingByOwner(prisma, w.property.id)).get(w.owners.tanvir.id)).toBe(3000000);
    expect((await json(await patch(w.adminLogin, w.loan, { installmentPaisa: 3000000 }))).data.loan.outstandingPaisa).toBe(3000000);
    await w.entry(w.owners.tanvir.id, "REVERSAL", 500000, { loanId: w.loan, reversesId: d.id });
    expect((await loanOutstandingByOwner(prisma, w.property.id, [w.owners.tanvir.id])).get(w.owners.tanvir.id)).toBe(3500000);
  });
});
