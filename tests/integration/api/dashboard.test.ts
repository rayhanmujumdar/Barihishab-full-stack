// GET /api/v1/dashboard — role-aware Home summary (Home PRD §3, F1–F12; main PRD S2, §9).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as dashboardRoute from "@/app/api/v1/dashboard/route";
import { prisma } from "@/lib/prisma";
import { createMoneyRequest, createTxn, createUser } from "../../helpers/factory";
import { distributionWorld } from "../../helpers/distribution";
import { apiRequest, json, loginAs, params, type Login } from "../../helpers/http";
import { freezeDhaka } from "../../helpers/money";
import { HIDDEN_COOKIE } from "@/lib/home/hidden";
import { DashboardSchema } from "@/app/api/v1/dashboard/schema";

beforeEach(() => freezeDhaka(vi, "2026-10-22T06:00:00Z"));
afterEach(() => vi.useRealTimers());

const get = (login: Login | null, cookie?: string) => dashboardRoute.GET(apiRequest("/dashboard", { login, cookie: cookie ?? login?.cookie }), params({}));
/** Every 200 body also has to match the documented schema. */
const body = async (login: Login) => DashboardSchema.parse((await json(await get(login))).data);

describe("GET /api/v1/dashboard", () => {
  it("is 401 without a session", async () => {
    await distributionWorld();
    const res = await get(null);
    expect(res.status).toBe(401);
    expect((await json(res)).success).toBe(false);
  });

  it("gives an Owner their own figures and no admin blocks (PRD §9 Nasrin)", async () => {
    const w = await distributionWorld();
    await prisma.property.update({ where: { id: w.property.id }, data: { name: "Ahmed Villa" } });
    await createMoneyRequest({ propertyId: w.property.id, ownerId: w.owners.nasrin.id, createdById: w.owner.id, amountPaisa: 1000000 });
    const res = await get(w.ownerLogin);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const d = DashboardSchema.parse((await json(res)).data);
    expect(d.houseName).toBe("Ahmed Villa");
    expect(d.month).toEqual({ key: "2026-10", open: true, firstMonth: false });
    expect(d.me).toMatchObject({ balancePaisa: -500000, balanceLabel: "ADVANCE", sharePercent: 40, entitlementPreviewPaisa: 3382760, advancesPaisa: 500000, loanOutstandingPaisa: 0 });
    expect(d.myRequest).toMatchObject({ type: "ADVANCE", status: "PENDING", amountRequestedPaisa: 1000000, once: false });
    expect(d.house).toEqual({ incomePaisa: 10300000, expensePaisa: 1398000, reservePaisa: 445100, previousDeficitPaisa: 0, distributablePaisa: 8456900, draft: true, shortfallPaisa: 0 });
    expect(d.activity.length).toBeGreaterThan(0);
    expect(d.notices).toEqual([]);
    expect(d.noticesMore).toBe(false);
    expect([d.desk, d.reminders, d.setup, d.quickActions]).toEqual([null, null, null, null]);
  });

  it("gives a Super Admin who is not an owner the desk and no personal figures", async () => {
    const w = await distributionWorld();
    const admin = await createUser({ roles: ["SUPER_ADMIN"] });
    const d = await body(await loginAs(admin));
    expect(d.me).toBeNull();
    expect(d.myRequest).toBeNull();
    expect(d.desk).toMatchObject({ fund: { totalPaisa: 4902000 }, pending: { count: 0, over3Days: 0 }, openComplaints: 0, invites: { waiting: 1, expired: 0 } });
    expect(d.desk?.reconciliation.status).toBe("CHECK");
    expect(d.reminders).toEqual([{ key: "RENT_STATUS", kind: "RENT_STATUS", month: "2026-10", units: [{ name: "Flat 3A", tenantName: "Nusrat Jahan" }] }]);
    expect(d.quickActions).toEqual({ monthOpen: true, generateRent: true });
    expect(w.property.id).toBeTruthy();
  });

  it("gives a Super Admin who is an owner both views", async () => {
    const w = await distributionWorld();
    const d = await body(w.adminLogin);
    expect(d.me).toMatchObject({ ownerId: w.owners.rayhan.id, balancePaisa: 0, balanceLabel: "SETTLED", sharePercent: 25, entitlementPreviewPaisa: 2114225 });
    expect(d.desk).not.toBeNull();
  });

  it("turns Generate rent off once every unit has rent", async () => {
    const w = await distributionWorld();
    await createTxn({ propertyId: w.property.id, periodId: w.oct.id, fundAccountId: w.cash.id, createdById: w.admin.id, kind: "INCOME", categoryId: w.categories.RENT.id, unitId: w.units.flat3a.id, amountPaisa: 1800000 });
    const d = await body(w.adminLogin);
    expect(d.quickActions).toEqual({ monthOpen: true, generateRent: false });
    expect(d.reminders).toEqual([]);
  });

  it("has no quick actions and a closed month when nothing is open", async () => {
    const w = await distributionWorld();
    await prisma.period.update({ where: { id: w.oct.id }, data: { status: "CLOSED" } });
    const d = await body(w.adminLogin);
    expect(d.month).toMatchObject({ key: "2026-10", open: false });
    // F12: the staircase is hidden while no month is open.
    expect(d.house).toBeNull();
    expect(d.quickActions).toEqual({ monthOpen: false, generateRent: false });
  });

  it("leaves out reminders hidden today on this device", async () => {
    const w = await distributionWorld();
    const d = (await json(await get(w.adminLogin, `${w.adminLogin.cookie}; ${HIDDEN_COOKIE}=${encodeURIComponent("RENT_STATUS@2026-10-22")}`))).data;
    expect(d.reminders).toEqual([]);
  });

  it("shows the setup checklist only while setup is unfinished", async () => {
    const w = await distributionWorld();
    const d = await body(w.adminLogin);
    // Sample house: everything done (Nasrin and Sabrina are linked).
    expect(d.setup).toBeNull();
  });
});
