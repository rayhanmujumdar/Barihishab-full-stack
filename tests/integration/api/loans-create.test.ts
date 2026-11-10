import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { json } from "../../helpers/http";
import { balanceOf, createLoanApi, data, fundBalance, loansWorld, type LoansWorld } from "../../helpers/loans";
import { freezeDhaka } from "../../helpers/money";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

const body = (w: LoansWorld, extra: Record<string, unknown> = {}) => ({
  ownerId: w.owners.farzana.id,
  amountPaisa: 5000000,
  date: "2026-10-12",
  fundAccountId: w.house.id,
  method: "BANK",
  referenceNo: "TRX-88",
  installmentPaisa: 500000,
  reason: "Daughter's school admission",
  ...extra,
});

describe("POST /api/v1/loans (Advances & Loans F4, ADV-01)", () => {
  it("records a direct loan: next number, fund down, balance unchanged, audited with the reason", async () => {
    const w = await loansWorld();
    const balance = await balanceOf(w.owners.farzana.id);
    const fund = await fundBalance(w, w.house.id);
    const res = await createLoanApi(w.adminLogin, body(w));
    expect(res.status).toBe(201);
    const d = await data(res);
    expect(d.loan).toMatchObject({ number: 2, status: "ACTIVE", origin: "DIRECT", principalPaisa: 5000000, outstandingPaisa: 5000000, installmentPaisa: 500000, isSelf: false, flagged: false });
    expect(d.warnings).toEqual([]);
    expect(await balanceOf(w.owners.farzana.id)).toBe(balance);
    expect(await fundBalance(w, w.house.id)).toBe(fund - 5000000);
    const row = await prisma.loan.findUniqueOrThrow({ where: { id: d.loan.id } });
    expect(row).toMatchObject({ method: "BANK", referenceNo: "TRX-88", disbursedOn: new Date("2026-10-12T00:00:00Z") });
    expect(await prisma.auditLog.count({ where: { action: "loan.created", entityId: d.loan.id, reason: "Daughter's school admission" } })).toBe(1);
  });

  it("flags a second loan for an owner who already has one (G9)", async () => {
    const w = await loansWorld();
    const d = await data(await createLoanApi(w.adminLogin, body(w, { ownerId: w.owners.tanvir.id })));
    expect(d.loan.flagged).toBe(true);
    expect(d.warnings).toContainEqual({ code: "OWNER_HAS_LOAN", loanNumber: 1, outstandingPaisa: 3500000 });
  });

  it("warns when the instalment is above the owner's average share and when the fund is short", async () => {
    const w = await loansWorld();
    await w.closedMonth("2026-08", { [w.owners.farzana.id]: 300000 });
    const d = await data(await createLoanApi(w.adminLogin, body(w, { fundAccountId: w.cash.id, method: "CASH", referenceNo: null })));
    // August 300000 and the closed September with nothing → average 150000.
    expect(d.warnings).toContainEqual({ code: "INSTALMENT_ABOVE_SHARE", averageSharePaisa: 150000 });
    expect(d.warnings.map((x: { code: string }) => x.code)).toContain("FUND_SHORT");
  });

  it("tags a Super Admin's loan to themself as Self (G12)", async () => {
    const w = await loansWorld();
    expect((await data(await createLoanApi(w.adminLogin, body(w, { ownerId: w.owners.rayhan.id })))).loan.isSelf).toBe(true);
  });

  it("validates reason, amount, reference, instalment, fund, owner and date", async () => {
    const w = await loansWorld();
    const field = async (extra: Record<string, unknown>) => {
      const res = await createLoanApi(w.adminLogin, body(w, extra));
      expect(res.status).toBe(422);
      return Object.keys((await json(res)).error.details.fields);
    };
    expect(await field({ reason: " " })).toContain("reason");
    expect(await field({ amountPaisa: 0 })).toContain("amountPaisa");
    expect(await field({ referenceNo: "" })).toContain("referenceNo");
    expect(await field({ installmentPaisa: 5000001 })).toContain("installmentPaisa");
    expect(await field({ installmentPaisa: 0 })).toContain("installmentPaisa");
    expect(await field({ fundAccountId: "00000000-0000-4000-8000-000000000000" })).toContain("fundAccountId");
    expect(await field({ ownerId: "00000000-0000-4000-8000-000000000000" })).toContain("ownerId");
    expect(await field({ date: "2026-12-30" })).toContain("date");
    expect(await prisma.loan.count({ where: { propertyId: w.property.id } })).toBe(1);
  });

  it("needs an open month", async () => {
    const w = await loansWorld();
    await prisma.period.update({ where: { id: w.oct.id }, data: { status: "CLOSED" } });
    const res = await createLoanApi(w.adminLogin, body(w));
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe("NO_OPEN_PERIOD");
  });

  it("refuses an Owner and replays an idempotent retry", async () => {
    const w = await loansWorld();
    expect((await createLoanApi(w.ownerLogin, body(w))).status).toBe(403);
    const first = await data(await createLoanApi(w.adminLogin, body(w), "same-key-1"));
    const again = await data(await createLoanApi(w.adminLogin, body(w), "same-key-1"));
    expect(again.loan.id).toBe(first.loan.id);
    expect(await prisma.loan.count({ where: { propertyId: w.property.id } })).toBe(2);
  });
});
