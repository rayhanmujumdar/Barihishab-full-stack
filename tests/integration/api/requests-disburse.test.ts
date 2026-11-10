import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { distributionWorld, postClose, postReopen } from "../../helpers/distribution";
import { freezeDhaka } from "../../helpers/money";
import { approve, data, disburse, error, outbox, requestsWorld, submitted, type RequestsWorld } from "../../helpers/requests";

// Lets one test make the disbursal audit fail to prove the payout rolls back.
const auditControl = vi.hoisted(() => ({ failOn: null as string | null }));
vi.mock("@/lib/audit", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/audit")>();
  return {
    ...mod,
    audit: (...args: Parameters<typeof mod.audit>) => (auditControl.failOn === args[1].action ? Promise.reject(new Error("audit down")) : mod.audit(...args)),
  };
});

beforeEach(() => freezeDhaka(vi));
afterEach(() => {
  vi.useRealTimers();
  auditControl.failOn = null;
});

const balance = async (ownerId: string) => Number((await prisma.ownerLedgerEntry.aggregate({ where: { ownerId }, _sum: { amountPaisa: true } }))._sum.amountPaisa ?? 0);

async function approved(w: RequestsWorld, over: Record<string, unknown> = {}, approvedPaisa?: number, note?: string) {
  const id = await submitted(w.tanvirLogin, over);
  const res = await approve(w.adminLogin, id, approvedPaisa ? { amountPaisa: approvedPaisa, note } : {});
  if (res.status !== 200) throw new Error(`approve failed ${res.status}`);
  return id;
}

const bkash = (w: RequestsWorld, over: Record<string, unknown> = {}) => ({ date: "2026-10-20", fundAccountId: w.cash.id, method: "BKASH", referenceNo: "TrxID 8K2", ...over });

describe("POST /api/v1/requests/:id/disburse (F7)", () => {
  it("posts an advance on the owner's statement and emails every owner without payment details (§7.2)", async () => {
    const w = await requestsWorld();
    const id = await approved(w, { amountPaisa: 800000, reason: "Car service before the trip home" }, 600000, "Reduced — bank balance is low until rent clears");
    const before = await balance(w.owners.tanvir.id);
    const res = await disburse(w.adminLogin, id, bkash(w));
    expect(res.status).toBe(201);
    const body = await data(res);
    expect(body.request).toMatchObject({ status: "DISBURSED", linkedEntry: { kind: "ADVANCE", voided: false } });
    expect(body.entry.kind).toBe("ADVANCE");
    const entry = await prisma.ownerLedgerEntry.findUniqueOrThrow({ where: { id: body.entry.id } });
    expect(entry).toMatchObject({ type: "ADVANCE", amountPaisa: BigInt(-600000), origin: "REQUEST", requestId: id, method: "BKASH", referenceNo: "TrxID 8K2", note: "Advance · Car service before the trip home" });
    expect(await balance(w.owners.tanvir.id)).toBe(before - 600000);

    const mails = await outbox(id, "DISBURSED");
    // Every owner with an active login except the Super Admin who paid it out.
    expect(mails.map((m) => m.toUserId).sort()).toEqual([w.owner.id, w.tanvirUser.id].sort());
    const toNasrin = mails.find((m) => m.toUserId === w.owner.id)!;
    expect(toNasrin.payload).toMatchObject({ actorName: "Rayhan Ahmed", amountApprovedPaisa: 600000, shortReason: "Car service before the trip home", note: null });
    expect(JSON.stringify(toNasrin.payload)).not.toMatch(/TrxID|BKASH|Cash/);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: id, action: "request.disbursed" } });
    expect(log.after).toMatchObject({ amountPaisa: 600000, date: "2026-10-20", method: "BKASH", referenceNo: "TrxID 8K2" });
  });

  it("opens a new loan with the instalment and leaves the balance alone", async () => {
    const w = await requestsWorld();
    const id = await approved(w, { type: "LOAN", amountPaisa: 2000000, repaymentPlan: "৳4,000 per month" });
    const before = await balance(w.owners.tanvir.id);
    const res = await disburse(w.adminLogin, id, bkash(w, { installmentPaisa: 400000 }));
    expect(res.status).toBe(201);
    const loan = await prisma.loan.findUniqueOrThrow({ where: { requestId: id } });
    expect(loan).toMatchObject({ number: 2, principalPaisa: BigInt(2000000), installmentPaisa: BigInt(400000), origin: "REQUEST", flagged: true, reason: "Cataract surgery deposit at Ispahani Eye Hospital" });
    expect(await balance(w.owners.tanvir.id)).toBe(before);
    expect((await data(res)).request.linkedEntry).toMatchObject({ kind: "LOAN", label: "Loan L2", loanNumber: 2 });
  });

  it("refuses an instalment above the loan", async () => {
    const w = await requestsWorld();
    const id = await approved(w, { type: "LOAN", amountPaisa: 200000 });
    expect((await error(await disburse(w.adminLogin, id, bkash(w, { installmentPaisa: 300000 })))).details.fields).toHaveProperty("installmentPaisa");
    expect((await prisma.moneyRequest.findUniqueOrThrow({ where: { id } })).status).toBe("APPROVED");
  });

  it("books a special grant as an OWNER_GRANT expense with the owner as beneficiary (§7.4)", async () => {
    const w = await requestsWorld();
    const id = await approved(w, { type: "GRANT", amountPaisa: 600000, reason: "Medical bills after the accident" });
    const res = await disburse(w.adminLogin, id, bkash(w, { method: "CASH", referenceNo: null }));
    expect(res.status).toBe(201);
    const txn = await prisma.houseTransaction.findUniqueOrThrow({ where: { requestId: id }, include: { category: true } });
    expect(txn).toMatchObject({ kind: "EXPENSE", amountPaisa: BigInt(600000), source: "REQUEST_GRANT", beneficiaryOwnerId: w.owners.tanvir.id, periodId: w.oct.id, description: "Owner special grant · Tanvir Ahmed · R-2026-001" });
    expect(txn.category.code).toBe("OWNER_GRANT");
    expect((await data(res)).request.linkedEntry).toMatchObject({ kind: "EXPENSE", month: "2026-10" });
  });

  it("needs a reference except for Cash, an active fund and a date not in the future", async () => {
    const w = await requestsWorld();
    const id = await approved(w);
    expect((await error(await disburse(w.adminLogin, id, bkash(w, { method: "BANK", referenceNo: "" })))).details.fields).toHaveProperty("referenceNo");
    expect((await error(await disburse(w.adminLogin, id, bkash(w, { date: "2026-10-21" })))).details.fields).toEqual({ date: "Date can't be in the future." });
    await prisma.fundAccount.update({ where: { id: w.bank.id }, data: { isActive: false } });
    expect((await error(await disburse(w.adminLogin, id, bkash(w, { fundAccountId: w.bank.id })))).details.fields).toEqual({ fundAccountId: "Pick an active fund account." });
  });

  it("needs an open month and stays APPROVED without one (G13)", async () => {
    const w = await requestsWorld();
    const id = await approved(w);
    await prisma.period.update({ where: { id: w.oct.id }, data: { status: "CLOSED" } });
    const res = await disburse(w.adminLogin, id, bkash(w));
    expect(res.status).toBe(409);
    expect(await error(res)).toMatchObject({ code: "NO_OPEN_PERIOD", message: "Open a month first — payouts are recorded in an open month." });
    expect((await prisma.moneyRequest.findUniqueOrThrow({ where: { id } })).status).toBe("APPROVED");
  });

  it("is all or nothing: a failure leaves the request APPROVED and no entry behind", async () => {
    const w = await requestsWorld();
    const id = await approved(w);
    auditControl.failOn = "request.disbursed";
    await expect(disburse(w.adminLogin, id, bkash(w))).resolves.toHaveProperty("status", 500);
    auditControl.failOn = null;
    expect((await prisma.moneyRequest.findUniqueOrThrow({ where: { id } })).status).toBe("APPROVED");
    expect(await prisma.ownerLedgerEntry.count({ where: { requestId: id } })).toBe(0);
    expect(await outbox(id, "DISBURSED")).toEqual([]);
  });

  it("can't be repeated; the same Idempotency-Key replays the first response", async () => {
    const w = await requestsWorld();
    const id = await approved(w);
    const first = await disburse(w.adminLogin, id, bkash(w), "disburse-key-1");
    const replay = await disburse(w.adminLogin, id, bkash(w), "disburse-key-1");
    expect(replay.status).toBe(201);
    expect((await data(replay)).entry).toEqual((await data(first)).entry);
    const again = await disburse(w.adminLogin, id, bkash(w));
    expect(again.status).toBe(409);
    expect((await error(again)).code).toBe("INVALID_REQUEST_STATUS");
    expect(await prisma.ownerLedgerEntry.count({ where: { requestId: id } })).toBe(1);
  });

  it("refuses a PENDING request", async () => {
    const w = await requestsWorld();
    const id = await submitted(w.tanvirLogin);
    expect((await error(await disburse(w.adminLogin, id, bkash(w)))).code).toBe("INVALID_REQUEST_STATUS");
  });

  it("returns fund-short warnings without blocking", async () => {
    const w = await requestsWorld();
    const id = await approved(w, { amountPaisa: 900000000 });
    const res = await disburse(w.adminLogin, id, bkash(w));
    expect(res.status).toBe(201);
    expect((await data(res)).warnings.map((x: { code: string }) => x.code)).toContain("FUND_SHORT");
  });
});

describe("a request advance survives a month reopen (EntryOrigin REQUEST)", () => {
  it("keeps the advance when October is closed and reopened", async () => {
    const w = await distributionWorld();
    const id = await submitted(w.ownerLogin);
    await approve(w.adminLogin, id);
    const res = await disburse(w.adminLogin, id, { date: "2026-10-20", fundAccountId: w.cash.id, method: "CASH" });
    expect(res.status).toBe(201);
    expect((await postClose(w.adminLogin, "2026-10")).status).toBe(200);
    expect((await postReopen(w.adminLogin, "2026-10")).status).toBe(200);
    const entry = await prisma.ownerLedgerEntry.findUniqueOrThrow({ where: { requestId: id } });
    expect(entry).toMatchObject({ origin: "REQUEST", voidedAt: null });
  });
});
