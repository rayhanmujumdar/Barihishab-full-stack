import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createUser } from "../../helpers/factory";
import { loginAs } from "../../helpers/http";
import { freezeDhaka } from "../../helpers/money";
import { advanceBody, cancel, data, edit, error, formContext, outbox, requestsWorld, submit, submitted } from "../../helpers/requests";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

describe("POST /api/v1/requests (F2)", () => {
  it("creates a numbered PENDING request, audits it and emails every Super Admin", async () => {
    const w = await requestsWorld();
    const res = await submit(w.ownerLogin, advanceBody());
    expect(res.status).toBe(201);
    const { request, warnings } = await data(res);
    expect(request).toMatchObject({
      number: "R-2026-001",
      status: "PENDING",
      type: "ADVANCE",
      ownerName: "Nasrin Ahmed",
      amountRequestedPaisa: 1000000,
      amountApprovedPaisa: null,
      neededBy: "2026-10-30",
      askedOn: "2026-10-20",
      isSelf: false,
      mine: true,
      recordedBy: null,
    });
    expect(warnings).toEqual([]);
    const second = await data(await submit(w.tanvirLogin, advanceBody({ amountPaisa: 800000, reason: "Car service before the trip home" })));
    expect(second.request.number).toBe("R-2026-002");

    const audits = await prisma.auditLog.findMany({ where: { entityId: request.id } });
    expect(audits.map((a) => a.action)).toEqual(["request.submitted"]);
    const mails = await outbox(request.id, "SUBMITTED");
    expect(mails.map((m) => m.toUserId)).toEqual([w.admin.id]);
    expect(mails[0].payload).toMatchObject({ event: "SUBMITTED", number: "R-2026-001", ownerName: "Nasrin Ahmed" });
  });

  it("refuses an empty amount, a short reason, a past needed-by date and a fourth file", async () => {
    const w = await requestsWorld();
    const fields = async (body: Record<string, unknown>) => (await error(await submit(w.ownerLogin, advanceBody(body)))).details.fields;
    expect(await fields({ amountPaisa: 0 })).toEqual({ amountPaisa: "Enter an amount greater than zero." });
    // Approvals start at ৳1, so smaller asks are refused up front.
    expect(await fields({ amountPaisa: 50 })).toEqual({ amountPaisa: "Ask for at least ৳1." });
    expect(await fields({ reason: "money" })).toEqual({ reason: "Tell everyone what it is for." });
    expect(await fields({ neededBy: "2026-10-19" })).toEqual({ neededBy: "Pick today or a later date." });
    expect(await fields({ attachmentIds: [randomUUID(), randomUUID(), randomUUID(), randomUUID()] })).toEqual({ attachmentIds: "At most 3 files." });
    expect(await prisma.moneyRequest.count()).toBe(0);
  });

  it("accepts today as needed-by and drops a repayment plan on non-loans", async () => {
    const w = await requestsWorld();
    const { request } = await data(await submit(w.ownerLogin, advanceBody({ neededBy: "2026-10-20", repaymentPlan: "৳4,000 per month" })));
    expect(request.repaymentPlan).toBeNull();
    const loan = await data(await submit(w.ownerLogin, advanceBody({ type: "LOAN", repaymentPlan: "৳4,000 per month" })));
    expect(loan.request.repaymentPlan).toBe("৳4,000 per month");
  });

  it("warns (never blocks) about another pending request, an existing loan and money owed", async () => {
    const w = await requestsWorld();
    await submitted(w.tanvirLogin);
    const loan = await data(await submit(w.tanvirLogin, advanceBody({ type: "LOAN", amountPaisa: 2000000 })));
    expect(loan.warnings).toEqual(expect.arrayContaining([{ code: "PENDING_EXISTS", number: "R-2026-001" }, expect.objectContaining({ code: "OWNER_HAS_LOAN", loanNumber: 1, outstandingPaisa: 3500000 })]));
    // Tanvir is owed ৳8,055.85 (opening) — G11.
    const adv = await data(await submit(w.tanvirLogin, advanceBody()));
    expect(adv.warnings).toEqual(expect.arrayContaining([{ code: "OWNER_OWED", balancePaisa: 805585 }]));
  });

  it("warns when an advance would go above the limit", async () => {
    const w = await requestsWorld();
    await prisma.period.update({ where: { id: w.sep.id }, data: { status: "OPEN" } });
    await w.entry(w.owners.nasrin.id, "ENTITLEMENT", 600000, { periodId: w.sep.id, entryDate: "2026-09-30" });
    await prisma.period.update({ where: { id: w.sep.id }, data: { status: "CLOSED" } });
    // Limit 600000 (one closed month); balance +100000 so nothing is used yet → 700000 goes above.
    const r = await data(await submit(w.ownerLogin, advanceBody({ amountPaisa: 700000 })));
    expect(r.warnings).toEqual(expect.arrayContaining([{ code: "ADVANCE_OVER_LIMIT", limitPaisa: 600000 }, { code: "OWNER_OWED", balancePaisa: 100000 }]));
    expect((await data(await submit(w.ownerLogin, advanceBody({ amountPaisa: 600000 })))).warnings.map((x: { code: string }) => x.code)).not.toContain("ADVANCE_OVER_LIMIT");
  });

  it("tags the Super Admin's own request as Self", async () => {
    const w = await requestsWorld();
    const { request } = await data(await submit(w.adminLogin, advanceBody()));
    expect(request).toMatchObject({ isSelf: true, ownerName: "Rayhan Ahmed" });
  });

  it("refuses a user without an owner profile", async () => {
    await requestsWorld();
    const loner = await loginAs(await createUser({ roles: ["OWNER"] }));
    const res = await submit(loner, advanceBody());
    expect(res.status).toBe(403);
    expect((await error(res)).code).toBe("NO_OWNER_PROFILE");
  });

  it("gives concurrent submissions different numbers", async () => {
    const w = await requestsWorld();
    const [a, b] = await Promise.all([submit(w.ownerLogin, advanceBody()), submit(w.tanvirLogin, advanceBody())]);
    const numbers = [(await data(a)).request.number, (await data(b)).request.number].sort();
    expect(numbers).toEqual(["R-2026-001", "R-2026-002"]);
  });

  it("is refused for anonymous callers", async () => {
    const res = await (await import("@/app/api/v1/requests/route")).POST(new Request("http://localhost:3000/api/v1/requests", { method: "POST", body: "{}" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
  });
});

describe("record a request for an owner (F11)", () => {
  it("lets the Super Admin record for an owner without login (no email to them)", async () => {
    const w = await requestsWorld();
    const res = await submit(w.adminLogin, advanceBody({ ownerId: w.owners.farzana.id, amountPaisa: 500000 }));
    expect(res.status).toBe(201);
    const { request } = await data(res);
    expect(request).toMatchObject({ ownerName: "Farzana Haque", recordedBy: "Rayhan Ahmed", isSelf: false });
    expect((await prisma.auditLog.findFirstOrThrow({ where: { entityId: request.id } })).action).toBe("request.recorded");
    expect(await outbox(request.id, "RECORDED")).toEqual([]);
  });

  it("emails a copy to an owner who has a login", async () => {
    const w = await requestsWorld();
    const { request } = await data(await submit(w.adminLogin, advanceBody({ ownerId: w.owners.tanvir.id })));
    const mails = await outbox(request.id, "RECORDED");
    expect(mails.map((m) => [m.toUserId, m.locale])).toEqual([[w.tanvirUser.id, "bn"]]);
  });

  it("forbids an Owner to record for someone else", async () => {
    const w = await requestsWorld();
    const res = await submit(w.ownerLogin, advanceBody({ ownerId: w.owners.tanvir.id }));
    expect(res.status).toBe(403);
    expect((await error(res)).code).toBe("FORBIDDEN");
  });
});

describe("PATCH /api/v1/requests/:id and cancel (F3)", () => {
  it("lets the requester edit while pending, audits before/after and tells the Admin", async () => {
    const w = await requestsWorld();
    const id = await submitted(w.tanvirLogin, { amountPaisa: 800000 });
    const res = await edit(w.tanvirLogin, id, { amountPaisa: 700000 });
    expect(res.status).toBe(200);
    expect((await data(res)).request.amountRequestedPaisa).toBe(700000);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: id, action: "request.edited" } });
    expect(log.before).toMatchObject({ amountPaisa: 800000 });
    expect(log.after).toMatchObject({ amountPaisa: 700000 });
    expect((await outbox(id, "EDITED")).map((m) => m.toUserId)).toEqual([w.admin.id]);
  });

  it("refuses edits after approval and by other owners", async () => {
    const w = await requestsWorld();
    const id = await submitted(w.tanvirLogin);
    expect((await edit(w.ownerLogin, id, { amountPaisa: 100 })).status).toBe(404);
    expect((await edit(w.adminLogin, id, { amountPaisa: 100 })).status).toBe(403);
    await prisma.moneyRequest.update({ where: { id }, data: { status: "APPROVED", amountApprovedPaisa: BigInt(1000000) } });
    const res = await edit(w.tanvirLogin, id, { amountPaisa: 700000 });
    expect(res.status).toBe(409);
    expect((await error(res)).code).toBe("INVALID_REQUEST_STATUS");
  });

  it("keeps an overdue pending request editable when its date isn't changed", async () => {
    const w = await requestsWorld();
    const id = await submitted(w.tanvirLogin);
    await prisma.moneyRequest.update({ where: { id }, data: { neededBy: new Date("2026-10-01T00:00:00Z") } });
    const res = await edit(w.tanvirLogin, id, { amountPaisa: 500000 });
    expect(res.status).toBe(200);
    expect((await data(res)).request).toMatchObject({ amountRequestedPaisa: 500000, neededBy: "2026-10-01", overdue: true });
  });

  it("refuses an edit to a past needed-by date", async () => {
    const w = await requestsWorld();
    const id = await submitted(w.tanvirLogin);
    expect((await error(await edit(w.tanvirLogin, id, { neededBy: "2026-10-01" }))).details.fields).toEqual({ neededBy: "Pick today or a later date." });
  });

  it("cancels pending and approved requests, never disbursed ones", async () => {
    const w = await requestsWorld();
    const a = await submitted(w.tanvirLogin);
    const res = await cancel(w.tanvirLogin, a);
    expect(res.status).toBe(200);
    expect((await data(res)).request.status).toBe("CANCELLED");
    expect((await outbox(a, "CANCELLED")).map((m) => m.toUserId)).toEqual([w.admin.id]);

    const b = await submitted(w.tanvirLogin);
    await prisma.moneyRequest.update({ where: { id: b }, data: { status: "APPROVED", amountApprovedPaisa: BigInt(1000000) } });
    expect((await data(await cancel(w.tanvirLogin, b))).request.status).toBe("CANCELLED");
    expect(await prisma.ownerLedgerEntry.count({ where: { requestId: b } })).toBe(0);

    const c = await submitted(w.tanvirLogin);
    await prisma.moneyRequest.update({ where: { id: c }, data: { status: "DISBURSED", amountApprovedPaisa: BigInt(1000000) } });
    expect((await error(await cancel(w.tanvirLogin, c))).code).toBe("INVALID_REQUEST_STATUS");
    expect((await cancel(w.ownerLogin, a)).status).toBe(404);
  });
});

describe("GET /api/v1/requests/form-context (F2 live info)", () => {
  it("returns the requester's balance, limit use, loans and pending numbers", async () => {
    const w = await requestsWorld();
    await submitted(w.tanvirLogin);
    const ctx = await data(await formContext(w.tanvirLogin));
    expect(ctx).toMatchObject({ ownerName: "Tanvir Ahmed", balancePaisa: 805585, advanceUsedPaisa: 0, openMonth: "2026-10", pendingNumbers: ["R-2026-001"] });
    expect(ctx.activeLoans).toEqual([expect.objectContaining({ number: 1, outstandingPaisa: 3500000 })]);
    const nasrin = await data(await formContext(w.ownerLogin));
    expect(nasrin).toMatchObject({ balancePaisa: -500000, advanceUsedPaisa: 500000, advanceLimitPaisa: null });
  });

  it("estimates the grant cost per 10 % share when an amount is given", async () => {
    const w = await requestsWorld();
    const ctx = await data(await formContext(w.ownerLogin, "?amountPaisa=600000"));
    expect(typeof ctx.grantPerTenPctPaisa).toBe("number");
  });

  it("forbids another owner's context without request.record", async () => {
    const w = await requestsWorld();
    expect((await formContext(w.ownerLogin, `?ownerId=${w.owners.tanvir.id}`)).status).toBe(403);
    expect((await formContext(w.adminLogin, `?ownerId=${w.owners.tanvir.id}`)).status).toBe(200);
  });
});
