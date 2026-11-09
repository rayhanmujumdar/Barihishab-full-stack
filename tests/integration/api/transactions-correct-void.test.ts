import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as one from "@/app/api/v1/transactions/[id]/route";
import * as voidRoute from "@/app/api/v1/transactions/[id]/void/route";
import * as summary from "@/app/api/v1/transactions/summary/route";
import { prisma } from "@/lib/prisma";
import { createPeriod, createTxn, moneyWorld } from "../../helpers/factory";
import { apiRequest, json, loginAs, params } from "../../helpers/http";
import { freezeDhaka } from "../../helpers/money";

// Lets one test make the audit insert fail to prove the write rolls back.
const auditControl = vi.hoisted(() => ({ fail: false }));
vi.mock("@/lib/audit", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/audit")>();
  return {
    ...mod,
    audit: (...args: Parameters<typeof mod.audit>) => (auditControl.fail ? Promise.reject(new Error("audit down")) : mod.audit(...args)),
  };
});

beforeEach(() => freezeDhaka(vi));
afterEach(() => {
  vi.useRealTimers();
  auditControl.fail = false;
});

async function setup() {
  const w = await moneyWorld();
  const nov = await createPeriod(w.property.id, "2026-11");
  const elec = await createTxn({ propertyId: w.property.id, periodId: w.oct.id, categoryId: w.categories.ELEC.id, fundAccountId: w.bank.id, createdById: w.admin.id, amountPaisa: 603000, vendor: "DESCO" });
  return { ...w, nov, elec, adminLogin: await loginAs(w.admin), ownerLogin: await loginAs(w.owner) };
}

const patch = (w: Awaited<ReturnType<typeof setup>>, body: Record<string, unknown>, login = w.adminLogin, id = w.elec.id) =>
  one.PATCH(apiRequest(`/transactions/${id}`, { method: "PATCH", login, body }), params({ id }));
const doVoid = (w: Awaited<ReturnType<typeof setup>>, reason: unknown, login = w.adminLogin, id = w.elec.id) =>
  voidRoute.POST(apiRequest(`/transactions/${id}/void`, { login, body: { reason } }), params({ id }));
const totals = async (w: Awaited<ReturnType<typeof setup>>, month: string) =>
  (await json(await summary.GET(apiRequest(`/transactions/summary?period=${month}`, { login: w.ownerLogin }), params({})))).data.totals;

describe("PATCH /api/v1/transactions/:id (COR-01/02)", () => {
  it("IE-05: corrects the amount, marks Corrected and audits only the change", async () => {
    const w = await setup();
    const res = await patch(w, { amountPaisa: 630000, reason: "Typo — the DESCO bill reads ৳6,300" });
    expect(res.status).toBe(200);
    expect((await json(res)).data.transaction).toMatchObject({ amountPaisa: 630000, isCorrected: true });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "transaction.updated", entityId: w.elec.id } });
    expect(log).toMatchObject({ before: { amountPaisa: 603000 }, after: { amountPaisa: 630000 }, reason: "Typo — the DESCO bill reads ৳6,300", actorId: w.admin.id });
    expect((await prisma.houseTransaction.findUniqueOrThrow({ where: { id: w.elec.id } })).updatedById).toBe(w.admin.id);
  });

  it("IE-06: requires a reason of 5+ characters", async () => {
    const w = await setup();
    expect((await patch(w, { amountPaisa: 630000 })).status).toBe(422);
    expect((await patch(w, { amountPaisa: 630000, reason: "typo" })).status).toBe(422);
  });

  it("rejects a no-op patch and a kind change", async () => {
    const w = await setup();
    expect((await patch(w, { amountPaisa: 603000, reason: "Nothing really" })).status).toBe(422);
    expect((await patch(w, { kind: "INCOME", reason: "Wrong kind here" })).status).toBe(422);
  });

  it("IE-18: moves an entry between Open months and both totals follow", async () => {
    const w = await setup();
    const res = await patch(w, { period: "2026-11", reason: "Belongs to November" });
    expect(res.status).toBe(200);
    expect((await json(res)).data.transaction.period).toBe("2026-11");
    expect((await totals(w, "2026-10")).expensePaisa).toBe(0);
    expect((await totals(w, "2026-11")).expensePaisa).toBe(603000);
  });

  it("IE-19: refuses to move into a Closed month", async () => {
    const w = await setup();
    const res = await patch(w, { period: "2026-09", txnDate: "2026-09-30", reason: "Belongs to September" });
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe("PERIOD_CLOSED");
  });

  it("refuses corrections in a Closed month", async () => {
    const w = await setup();
    await prisma.period.update({ where: { id: w.oct.id }, data: { status: "CLOSED" } });
    expect((await patch(w, { amountPaisa: 630000, reason: "Typo fix here" })).status).toBe(409);
  });

  it("IE-08: a voided entry can't be corrected", async () => {
    const w = await setup();
    await doVoid(w, "Duplicate entry");
    const res = await patch(w, { amountPaisa: 630000, reason: "Typo fix here" });
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe("ALREADY_VOIDED");
  });

  it("keeps a since-deactivated category valid while it isn't changed", async () => {
    const w = await setup();
    await prisma.category.update({ where: { id: w.categories.ELEC.id }, data: { isActive: false } });
    expect((await patch(w, { vendor: "DESCO Ltd", reason: "Full vendor name" })).status).toBe(200);
  });

  it("is forbidden to owners", async () => {
    const w = await setup();
    expect((await patch(w, { amountPaisa: 630000, reason: "Typo fix here" }, w.ownerLogin)).status).toBe(403);
  });
});

describe("Concurrent writes to one entry", () => {
  it("serialises corrections: every audit row's before is the previous after (no lost update)", async () => {
    const w = await setup();
    const results = await Promise.all([
      patch(w, { amountPaisa: 610000, reason: "Owner A re-read the bill" }),
      patch(w, { amountPaisa: 620000, reason: "Owner B re-read the bill" }),
    ]);
    const bodies = await Promise.all(results.map((r) => json(r)));
    for (const [i, r] of results.entries()) {
      if (r.status !== 200) expect([r.status, bodies[i].error.code]).toEqual([409, "ENTRY_CHANGED"]);
    }
    const logs = await prisma.auditLog.findMany({ where: { action: "transaction.updated", entityId: w.elec.id }, orderBy: { id: "asc" } });
    expect(logs).toHaveLength(results.filter((r) => r.status === 200).length);
    let amount = 603000;
    for (const log of logs) {
      expect((log.before as { amountPaisa: number }).amountPaisa).toBe(amount);
      amount = (log.after as { amountPaisa: number }).amountPaisa;
    }
    expect(Number((await prisma.houseTransaction.findUniqueOrThrow({ where: { id: w.elec.id } })).amountPaisa)).toBe(amount);
  });

  it("voids once when two voids race", async () => {
    const w = await setup();
    const results = await Promise.all([doVoid(w, "Duplicate entry"), doVoid(w, "Entered twice")]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.auditLog.count({ where: { action: "transaction.voided", entityId: w.elec.id } })).toBe(1);
  });
});

describe("POST /api/v1/transactions/:id/void (VOD-01/02)", () => {
  it("IE-07: voids with a reason; the entry stays and leaves the totals", async () => {
    const w = await setup();
    const res = await doVoid(w, "Duplicate entry");
    expect(res.status).toBe(200);
    const { data } = await json(res);
    expect(data.transaction).toMatchObject({ voidReason: "Duplicate entry", voidedAt: expect.any(String) });
    expect(data.periodTotals.expensePaisa).toBe(0);
    expect(await prisma.houseTransaction.count()).toBe(1);
    expect(await prisma.auditLog.findFirst({ where: { action: "transaction.voided", entityId: w.elec.id, reason: "Duplicate entry" } })).toBeTruthy();
  });

  it("refuses short reasons, double voids and Closed months", async () => {
    const w = await setup();
    expect((await doVoid(w, "dup")).status).toBe(422);
    await doVoid(w, "Duplicate entry");
    const again = await doVoid(w, "Duplicate entry");
    expect((await json(again)).error.code).toBe("ALREADY_VOIDED");

    const other = await createTxn({ propertyId: w.property.id, periodId: w.oct.id, categoryId: w.categories.GAS.id, fundAccountId: w.bank.id, createdById: w.admin.id });
    await prisma.period.update({ where: { id: w.oct.id }, data: { status: "CLOSED" } });
    const closed = await doVoid(w, "Duplicate entry", w.adminLogin, other.id);
    expect((await json(closed)).error.code).toBe("PERIOD_CLOSED");
  });

  it("is forbidden to owners and 404s for unknown entries", async () => {
    const w = await setup();
    expect((await doVoid(w, "Duplicate entry", w.ownerLogin)).status).toBe(403);
    const id = "00000000-0000-4000-8000-000000000000";
    expect((await doVoid(w, "Duplicate entry", w.adminLogin, id)).status).toBe(404);
  });

  it("rolls the void back when the audit write fails (AUD-01)", async () => {
    const w = await setup();
    auditControl.fail = true;
    const res = await doVoid(w, "Duplicate entry");
    expect(res.status).toBe(500);
    expect((await prisma.houseTransaction.findUniqueOrThrow({ where: { id: w.elec.id } })).voidedAt).toBeNull();
  });
});
