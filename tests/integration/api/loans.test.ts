import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as loans from "@/app/api/v1/loans/[id]/route";
import { loanOutstandingByOwner } from "@/lib/loans/loan-service";
import { prisma } from "@/lib/prisma";
import { createLoan, createLoanMovement } from "../../helpers/factory";
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
    const res = await patch(w.adminLogin, w.loan, { installmentPaisa: 500000, reason: "Agreed at family meeting" });
    expect(res.status).toBe(200);
    expect((await json(res)).data.loan).toMatchObject({ id: w.loan, installmentPaisa: 500000, outstandingPaisa: 3500000, status: "ACTIVE" });
    const row = await prisma.auditLog.findFirstOrThrow({ where: { action: "loan.updated", entityId: w.loan } });
    expect(row.before).toEqual({ installmentPaisa: null });
    expect(row.after).toEqual({ installmentPaisa: 500000 });
    expect(row.reason).toBe("Agreed at family meeting");
    const cleared = await json(await patch(w.adminLogin, w.loan, { installmentPaisa: null, reason: "Agreed at family meeting" }));
    expect(cleared.data.loan.installmentPaisa).toBeNull();
  });

  it("needs a reason and returns the new expected finish month (F7, G3)", async () => {
    const w = await world();
    const missing = await patch(w.adminLogin, w.loan, { installmentPaisa: 500000 });
    expect(missing.status).toBe(422);
    expect((await json(missing)).error.details.fields.reason).toBeTruthy();
    expect((await json(await patch(w.adminLogin, w.loan, { installmentPaisa: 500000, reason: " " }))).error.code).toBe("VALIDATION_FAILED");
    // ৳35,000 left; disbursed June and October is the earliest open month → first instalment October.
    const five = (await json(await patch(w.adminLogin, w.loan, { installmentPaisa: 500000, reason: "Agreed" }))).data;
    expect(five.expectedFinishMonth).toBe("2027-04");
    const three = (await json(await patch(w.adminLogin, w.loan, { installmentPaisa: 300000, reason: "Reduced until March at owner's request" }))).data;
    expect(three.expectedFinishMonth).toBe("2027-09");
    expect((await json(await patch(w.adminLogin, w.loan, { installmentPaisa: null, reason: "Manual" }))).data.expectedFinishMonth).toBeNull();
  });

  it("refuses an instalment above the outstanding, a closed loan, an unknown id and an Owner", async () => {
    const w = await world();
    expect((await patch(w.adminLogin, w.loan, { installmentPaisa: 3500001, reason: "Agreed at family meeting" })).status).toBe(422);
    expect((await patch(w.adminLogin, w.loan, { installmentPaisa: 0, reason: "Agreed at family meeting" })).status).toBe(422);
    const repaid = await createLoan({ propertyId: w.property.id, ownerId: w.owners.tanvir.id, fundAccountId: w.cash.id, createdById: w.admin.id, principalPaisa: 1000, status: "REPAID" });
    const closed = await patch(w.adminLogin, repaid.id, { installmentPaisa: 100, reason: "Agreed at family meeting" });
    expect(closed.status).toBe(409);
    expect((await json(closed)).error.code).toBe("LOAN_NOT_ACTIVE");
    expect((await patch(w.adminLogin, randomUUID(), { installmentPaisa: 100, reason: "Agreed at family meeting" })).status).toBe(404);
    expect((await patch(w.adminLogin, "nope", { installmentPaisa: 100, reason: "Agreed at family meeting" })).status).toBe(404);
    expect((await patch(w.ownerLogin, w.loan, { installmentPaisa: 100, reason: "Agreed at family meeting" })).status).toBe(403);
  });

  it("outstanding = principal − loan deductions, voided deductions restore it", async () => {
    const w = await world();
    const d = await w.entry(w.owners.tanvir.id, "LOAN_DEDUCTION", -500000, { loanId: w.loan });
    expect((await loanOutstandingByOwner(prisma, w.property.id)).get(w.owners.tanvir.id)).toBe(3000000);
    expect((await json(await patch(w.adminLogin, w.loan, { installmentPaisa: 3000000, reason: "Agreed at family meeting" }))).data.loan.outstandingPaisa).toBe(3000000);
    await w.entry(w.owners.tanvir.id, "REVERSAL", 500000, { loanId: w.loan, reversesId: d.id });
    expect((await loanOutstandingByOwner(prisma, w.property.id, [w.owners.tanvir.id])).get(w.owners.tanvir.id)).toBe(3500000);
  });

  it("outstanding also counts cash repayments; a voided one and its reversal cancel out (§7.1)", async () => {
    const w = await world();
    const base = { propertyId: w.property.id, loanId: w.loan, periodId: w.oct.id, createdById: w.admin.id, fundAccountId: w.cash.id };
    await w.entry(w.owners.tanvir.id, "LOAN_DEDUCTION", -500000, { loanId: w.loan });
    const cash = await createLoanMovement({ ...base, type: "CASH_REPAYMENT", amountPaisa: -1000000 });
    expect((await loanOutstandingByOwner(prisma, w.property.id)).get(w.owners.tanvir.id)).toBe(2000000);
    await prisma.loanMovement.update({ where: { id: cash.id }, data: { voidedAt: new Date(), voidedById: w.admin.id, voidReason: "Wrong loan" } });
    await createLoanMovement({ ...base, type: "REVERSAL", amountPaisa: 1000000, reversesId: cash.id });
    expect((await loanOutstandingByOwner(prisma, w.property.id)).get(w.owners.tanvir.id)).toBe(3000000);
  });
});
