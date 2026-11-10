import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as voidLedger from "@/app/api/v1/ledger/[id]/void/route";
import * as seenRoute from "@/app/api/v1/requests/seen/route";
import { prisma } from "@/lib/prisma";
import { requestBadge } from "@/lib/requests/request-read";
import { createMoneyRequest, createTxn, setReserveRule } from "../../helpers/factory";
import { apiRequest, params } from "../../helpers/http";
import { cancelLoan } from "../../helpers/loans";
import { freezeDhaka } from "../../helpers/money";
import { approve, data, detail, disburse, edit, list, reject, requestsWorld, submitted, type RequestsWorld } from "../../helpers/requests";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

const cash = (w: RequestsWorld) => ({ date: "2026-10-20", fundAccountId: w.cash.id, method: "CASH" });
const paidOut = async (w: RequestsWorld, over: Record<string, unknown> = {}, login = w.tanvirLogin) => {
  const id = await submitted(login, over);
  await approve(w.adminLogin, id);
  const res = await disburse(w.adminLogin, id, cash(w));
  if (res.status !== 201) throw new Error(`disburse ${res.status}`);
  return id;
};

describe("GET /api/v1/requests (F1, F12)", () => {
  it("gives the Super Admin pending (overdue first), approved and history sections", async () => {
    const w = await requestsWorld();
    const later = await submitted(w.tanvirLogin, { neededBy: "2026-10-30" });
    const p = w.property.id;
    const overdue = await createMoneyRequest({ propertyId: p, ownerId: w.owners.nasrin.id, createdById: w.owner.id, neededBy: "2026-10-15" });
    const appr = await submitted(w.ownerLogin, { neededBy: "2026-10-25" });
    await approve(w.adminLogin, appr);
    const rej = await submitted(w.ownerLogin, { type: "LOAN" });
    await reject(w.adminLogin, rej);
    const body = await data(await list(w.adminLogin));
    expect(body.scope).toBe("all");
    expect(body.pending.map((r: { id: string }) => r.id)).toEqual([overdue.id, later]);
    expect(body.pending[0].overdue).toBe(true);
    expect(body.approved.map((r: { id: string }) => r.id)).toEqual([appr]);
    expect(body.history.map((r: { id: string }) => r.id)).toEqual([rej]);
    expect(body.years).toEqual([2026]);
  });

  it("filters history by owner, type, status and year", async () => {
    const w = await requestsWorld();
    const grant = await paidOut(w, { type: "GRANT", amountPaisa: 100000 });
    const rej = await submitted(w.ownerLogin);
    await reject(w.adminLogin, rej);
    const ids = async (q: string) => (await data(await list(w.adminLogin, q))).history.map((r: { id: string }) => r.id);
    expect(await ids("?type=GRANT&year=2026")).toEqual([grant]);
    expect(await ids(`?ownerId=${w.owners.nasrin.id}`)).toEqual([rej]);
    expect(await ids("?status=REJECTED")).toEqual([rej]);
    expect(await ids("?year=2025")).toEqual([]);
    expect((await list(w.adminLogin, "?status=NOPE")).status).toBe(422);
  });

  it("gives an owner their own requests and everyone's paid-out ones with public fields only", async () => {
    const w = await requestsWorld();
    const mine = await submitted(w.ownerLogin);
    const tanvirPending = await submitted(w.tanvirLogin);
    const tanvirPaid = await paidOut(w, { reason: "Car service before the trip home" });
    await prisma.moneyRequest.update({ where: { id: tanvirPaid }, data: { decisionNote: "Private note" } });
    const body = await data(await list(w.ownerLogin));
    expect(body.scope).toBe("own");
    expect(body.mine.map((r: { id: string }) => r.id)).toEqual([mine]);
    expect(body.paidOut.map((r: { id: string }) => r.id)).toEqual([tanvirPaid]);
    expect(body.paidOut[0]).toMatchObject({ limited: true, decisionNote: null, ownerName: "Tanvir Ahmed", reason: "Car service before the trip home", decidedBy: "Rayhan Ahmed" });
    expect(JSON.stringify(body)).not.toContain(tanvirPending);
  });

  it("reads never write; POST /requests/seen clears the requester's unseen decisions (badge)", async () => {
    const w = await requestsWorld();
    const id = await submitted(w.tanvirLogin);
    await approve(w.adminLogin, id);
    const viewer = { userId: w.tanvirUser.id, viewAll: false };
    expect(await requestBadge(w.property.id, viewer)).toBe(1);
    expect(await requestBadge(w.property.id, { userId: w.admin.id, viewAll: true })).toBe(0);
    const mine = (await data(await list(w.tanvirLogin))).mine;
    expect(mine[0].unseen).toBe(true);
    expect(await requestBadge(w.property.id, viewer)).toBe(1);
    const res = await seenRoute.POST(apiRequest("/requests/seen", { login: w.tanvirLogin, body: {} }), params({}));
    expect(await data(res)).toEqual({ cleared: 1 });
    expect(await requestBadge(w.property.id, viewer)).toBe(0);
    // Nasrin's call never touches Tanvir's flags.
    await approve(w.adminLogin, await submitted(w.tanvirLogin));
    expect(await data(await seenRoute.POST(apiRequest("/requests/seen", { login: w.ownerLogin, body: {} }), params({})))).toEqual({ cleared: 0 });
    expect(await requestBadge(w.property.id, viewer)).toBe(1);
  });

  it("pages History and Paid out (default 50, `limit` for more)", async () => {
    const w = await requestsWorld();
    for (let i = 0; i < 52; i++) await createMoneyRequest({ propertyId: w.property.id, ownerId: w.owners.tanvir.id, createdById: w.tanvirUser.id, status: "DISBURSED" });
    const first = await data(await list(w.adminLogin));
    expect(first.history).toHaveLength(50);
    expect(first.historyMore).toBe(true);
    const more = await data(await list(w.adminLogin, "?limit=100"));
    expect(more.history).toHaveLength(52);
    expect(more.historyMore).toBe(false);
    const owner = await data(await list(w.ownerLogin, "?limit=10"));
    expect(owner.paidOut).toHaveLength(10);
    expect(owner.paidOutMore).toBe(true);
    expect((await list(w.adminLogin, "?limit=9999")).status).toBe(422);
  });

  it("is refused anonymously", async () => {
    const res = await (await import("@/app/api/v1/requests/route")).GET(apiRequest("/requests"), params({}));
    expect(res.status).toBe(401);
  });
});

describe("public fields of another owner's paid-out request (Rule 12)", () => {
  it("shows the approved amount and paid date, never the asked amount or dates", async () => {
    const w = await requestsWorld();
    const id = await submitted(w.tanvirLogin, { amountPaisa: 800000, neededBy: "2026-10-25" });
    await approve(w.adminLogin, id, { amountPaisa: 600000, note: "Fund is low" });
    await disburse(w.adminLogin, id, cash(w));
    const [paid] = (await data(await list(w.ownerLogin))).paidOut;
    expect(paid).toMatchObject({ limited: true, amountRequestedPaisa: 600000, amountApprovedPaisa: 600000, askedOn: "2026-10-20", neededBy: "2026-10-20", repaymentPlan: null, recordedBy: null });
    const mails = await (await import("../../helpers/requests")).outbox(id, "DISBURSED");
    expect(mails.find((m) => m.toUserId === w.owner.id)!.payload).toMatchObject({ amountRequestedPaisa: 600000, note: null });
    expect(mails.find((m) => m.toUserId === w.tanvirUser.id)!.payload).toMatchObject({ amountRequestedPaisa: 800000 });
  });
});

describe("GET /api/v1/requests/:id (F9, F4, Rule 12)", () => {
  it("hides another owner's pending request and shows a paid-out one without method or notes", async () => {
    const w = await requestsWorld();
    const pending = await submitted(w.tanvirLogin);
    expect((await detail(w.ownerLogin, pending)).status).toBe(404);
    const paid = await paidOut(w);
    const d = await data(await detail(w.ownerLogin, paid));
    expect(d.request.limited).toBe(true);
    expect(d.context).toBeNull();
    expect(d.timeline.map((t: { kind: string }) => t.kind)).toEqual(["APPROVED", "DISBURSED"]);
    expect(d.timeline.every((t: { method: unknown; referenceNo: unknown; note: unknown }) => t.method === null && t.referenceNo === null && t.note === null)).toBe(true);
  });

  it("lists the timeline oldest first with who and what", async () => {
    const w = await requestsWorld();
    const id = await submitted(w.tanvirLogin, { amountPaisa: 800000 });
    await edit(w.tanvirLogin, id, { amountPaisa: 700000 });
    await approve(w.adminLogin, id, { amountPaisa: 600000, note: "Fund is low" });
    await disburse(w.adminLogin, id, { date: "2026-10-20", fundAccountId: w.cash.id, method: "BKASH", referenceNo: "TrxID 8K2" });
    const d = await data(await detail(w.tanvirLogin, id));
    expect(d.timeline).toEqual([
      expect.objectContaining({ kind: "SUBMITTED", by: "Tanvir", amountPaisa: 800000 }),
      expect.objectContaining({ kind: "EDITED", by: "Tanvir", amountPaisa: 700000 }),
      expect.objectContaining({ kind: "APPROVED", by: "Rayhan Ahmed", amountPaisa: 600000, note: "Fund is low" }),
      expect.objectContaining({ kind: "DISBURSED", by: "Rayhan Ahmed", date: "2026-10-20", method: "BKASH", referenceNo: "TrxID 8K2" }),
    ]);
  });

  it("gives the Super Admin advance context with limit use and warnings", async () => {
    const w = await requestsWorld();
    await submitted(w.ownerLogin, { amountPaisa: 1000000 });
    const second = await submitted(w.ownerLogin, { amountPaisa: 1000000 });
    const ctx = (await data(await detail(w.adminLogin, second))).context;
    expect(ctx).toMatchObject({ balancePaisa: -500000, advanceUsedPaisa: 500000, loanOutstandingPaisa: 0, openMonth: "2026-10", advance: { usedBeforePaisa: 500000, usedAfterPaisa: 1500000, overLimit: false }, loan: null, grant: null, pendingOthers: ["R-2026-001"] });
    expect(ctx.aboveHouseFund).toBe(ctx.houseFundPaisa < 1000000);
  });

  it("gives loan context with the plan instalment and the 24-month check", async () => {
    const w = await requestsWorld();
    const id = await submitted(w.tanvirLogin, { type: "LOAN", amountPaisa: 2000000, repaymentPlan: "৳4,000 per month from entitlement" });
    const ctx = (await data(await detail(w.adminLogin, id))).context;
    expect(ctx.loan).toMatchObject({ planInstalmentPaisa: 400000, finishesWithin24Months: true, activeLoans: [expect.objectContaining({ number: 1, outstandingPaisa: 3500000 })] });
    expect(ctx.loanOutstandingPaisa).toBe(3500000);
  });

  it("gives grant context: the open month's distributable drop per owner (§11.3)", async () => {
    const w = await requestsWorld();
    await setReserveRule(w.property.id, { mode: "PERCENT", percentBp: 500 });
    // Surplus 9752000 → 5 % reserve 487600 → distributable 9264400.
    await createTxn({ propertyId: w.property.id, periodId: w.oct.id, kind: "INCOME", categoryId: w.categories.ROOFTOP.id, fundAccountId: w.cash.id, createdById: w.admin.id, amountPaisa: 9752000 });
    const id = await submitted(w.tanvirLogin, { type: "GRANT", amountPaisa: 600000 });
    const ctx = (await data(await detail(w.adminLogin, id))).context;
    expect(ctx.grant).toMatchObject({ month: "2026-10", distributableBeforePaisa: 9264400, dropPaisa: 570000 });
    const nasrin = ctx.grant.owners.find((o: { name: string }) => o.name === "Nasrin Ahmed");
    expect(nasrin).toMatchObject({ sharePct: 40, dropPaisa: 228000 });
  });

  it("shows the linked entry and marks it voided once the advance is voided or the loan cancelled", async () => {
    const w = await requestsWorld();
    const adv = await paidOut(w);
    const entry = await prisma.ownerLedgerEntry.findUniqueOrThrow({ where: { requestId: adv } });
    const v = await voidLedger.POST(apiRequest(`/ledger/${entry.id}/void`, { login: w.adminLogin, body: { reason: "Paid to the wrong owner" } }), params({ id: entry.id }));
    expect(v.status).toBe(200);
    const d = await data(await detail(w.tanvirLogin, adv));
    expect(d.request).toMatchObject({ status: "DISBURSED", linkedEntry: { kind: "ADVANCE", voided: true } });

    const loanReq = await paidOut(w, { type: "LOAN", amountPaisa: 200000 });
    const loan = await prisma.loan.findUniqueOrThrow({ where: { requestId: loanReq } });
    expect((await cancelLoan(w.adminLogin, loan.id)).status).toBe(200);
    expect((await data(await detail(w.tanvirLogin, loanReq))).request.linkedEntry).toMatchObject({ kind: "LOAN", voided: true });
  });

  it("returns 404 for unknown ids", async () => {
    const w = await requestsWorld();
    expect((await detail(w.adminLogin, "00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await detail(w.adminLogin, "nope")).status).toBe(404);
  });
});
