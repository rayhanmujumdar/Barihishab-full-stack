import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { freezeDhaka } from "../../helpers/money";
import { advanceBody, approve, data, disburse, error, outbox, reject, requestsWorld, submit, submitted, withdraw } from "../../helpers/requests";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

describe("POST /api/v1/requests/:id/approve (F5)", () => {
  it("approves the full amount by default, moves no money and emails the requester", async () => {
    const w = await requestsWorld();
    const id = await submitted(w.tanvirLogin, { amountPaisa: 800000 });
    const res = await approve(w.adminLogin, id);
    expect(res.status).toBe(200);
    expect((await data(res)).request).toMatchObject({ status: "APPROVED", amountApprovedPaisa: 800000, decidedBy: "Rayhan Ahmed" });
    const row = await prisma.moneyRequest.findUniqueOrThrow({ where: { id } });
    expect(row.decisionUnseen).toBe(true);
    expect(await prisma.ownerLedgerEntry.count({ where: { requestId: id } })).toBe(0);
    const mails = await outbox(id, "APPROVED");
    expect(mails.map((m) => [m.toUserId, m.locale])).toEqual([[w.tanvirUser.id, "bn"]]);
    expect((await prisma.auditLog.findFirstOrThrow({ where: { entityId: id, action: "request.approved" } })).after).toMatchObject({ amountApprovedPaisa: 800000 });
  });

  it("approves a lower amount with a note (§7.2)", async () => {
    const w = await requestsWorld();
    const id = await submitted(w.tanvirLogin, { amountPaisa: 800000 });
    const res = await approve(w.adminLogin, id, { amountPaisa: 600000, note: "Reduced — bank balance is low until rent clears" });
    expect((await data(res)).request).toMatchObject({ amountApprovedPaisa: 600000, decisionNote: "Reduced — bank balance is low until rent clears" });
    expect((await outbox(id, "APPROVED"))[0].payload).toMatchObject({ note: "Reduced — bank balance is low until rent clears", amountApprovedPaisa: 600000 });
  });

  it("refuses a lower amount without a note, above requested, and ৳0", async () => {
    const w = await requestsWorld();
    const id = await submitted(w.tanvirLogin, { amountPaisa: 800000 });
    expect((await error(await approve(w.adminLogin, id, { amountPaisa: 600000 }))).details.fields).toEqual({ note: "Explain why the amount is lower." });
    expect((await error(await approve(w.adminLogin, id, { amountPaisa: 900000 }))).details.fields).toEqual({ amountPaisa: "Approve between ৳1 and ৳8,000." });
    expect((await error(await approve(w.adminLogin, id, { amountPaisa: 0 }))).details.fields).toEqual({ amountPaisa: "Approve between ৳1 and ৳8,000." });
    expect((await prisma.moneyRequest.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
  });

  it("tags a self-request and emails every other owner with a login", async () => {
    const w = await requestsWorld();
    const id = (await data(await submit(w.adminLogin, advanceBody()))).request.id;
    await approve(w.adminLogin, id);
    const mails = await outbox(id, "SELF_APPROVED");
    expect(mails.map((m) => m.toUserId).sort()).toEqual([w.owner.id, w.tanvirUser.id].sort());
    expect(mails[0].payload).toMatchObject({ note: null });
  });

  it("lets only one of two concurrent approvals win", async () => {
    const w = await requestsWorld();
    const id = await submitted(w.tanvirLogin);
    const results = await Promise.all([approve(w.adminLogin, id), approve(w.adminLogin, id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });
});

describe("reject and withdraw (F6, F8)", () => {
  it("rejects with a reason the requester sees", async () => {
    const w = await requestsWorld();
    const id = await submitted(w.tanvirLogin, { type: "LOAN", amountPaisa: 2000000, repaymentPlan: "৳4,000 per month" });
    const res = await reject(w.adminLogin, id);
    expect((await data(res)).request).toMatchObject({ status: "REJECTED", decisionNote: "Existing loan L2 still has ৳40,000 outstanding" });
    expect((await outbox(id, "REJECTED"))[0].payload).toMatchObject({ note: "Existing loan L2 still has ৳40,000 outstanding" });
  });

  it("needs a reason", async () => {
    const w = await requestsWorld();
    const id = await submitted(w.tanvirLogin);
    expect((await error(await reject(w.adminLogin, id, "  "))).details.fields).toHaveProperty("reason");
    expect((await error(await withdraw(w.adminLogin, id, ""))).details.fields).toHaveProperty("reason");
  });

  it("withdraws only an approved request, and rejecting an approved one is refused", async () => {
    const w = await requestsWorld();
    const id = await submitted(w.tanvirLogin);
    expect((await error(await withdraw(w.adminLogin, id))).code).toBe("INVALID_REQUEST_STATUS");
    await approve(w.adminLogin, id);
    expect((await error(await reject(w.adminLogin, id))).code).toBe("INVALID_REQUEST_STATUS");
    const res = await withdraw(w.adminLogin, id);
    expect((await data(res)).request).toMatchObject({ status: "WITHDRAWN", decisionNote: "House Fund ran short this month" });
    expect(await outbox(id, "WITHDRAWN")).toHaveLength(1);
  });

  it("forbids owners every decision", async () => {
    const w = await requestsWorld();
    const id = await submitted(w.tanvirLogin);
    expect((await approve(w.ownerLogin, id)).status).toBe(403);
    expect((await reject(w.ownerLogin, id)).status).toBe(403);
    expect((await withdraw(w.ownerLogin, id)).status).toBe(403);
    expect((await disburse(w.ownerLogin, id, { date: "2026-10-20", fundAccountId: w.cash.id, method: "CASH" })).status).toBe(403);
    expect((await approve(w.tanvirLogin, id)).status).toBe(403);
  });

  it("returns 404 for an unknown request", async () => {
    const w = await requestsWorld();
    expect((await approve(w.adminLogin, "00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await approve(w.adminLogin, "not-a-uuid")).status).toBe(404);
  });
});
