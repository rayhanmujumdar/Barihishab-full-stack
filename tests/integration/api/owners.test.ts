import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as list from "@/app/api/v1/owners/route";
import * as one from "@/app/api/v1/owners/[id]/route";
import { prisma } from "@/lib/prisma";
import { createOwner, createShareSet, createUser } from "../../helpers/factory";
import { apiRequest, json, params, type Login } from "../../helpers/http";
import { freezeDhaka } from "../../helpers/money";
import { ownersWorld } from "../../helpers/owners";

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
afterEach(() => vi.useRealTimers());

const getList = async (login: Login | null) => list.GET(apiRequest("/owners", { login }), params({}));
const getOne = async (login: Login, id: string, query = "") => one.GET(apiRequest(`/owners/${id}${query}`, { login }), params({ id }));
const patch = async (login: Login, id: string, body: unknown) => one.PATCH(apiRequest(`/owners/${id}`, { login, method: "PATCH", body }), params({ id }));
const post = async (login: Login, body: unknown) => list.POST(apiRequest("/owners", { login, body }), params({}));
const lastAudit = (action: string, entityId: string) => prisma.auditLog.findFirst({ where: { action, entityId }, orderBy: { id: "desc" } });

type Item = { id: string; displayName: string; [k: string]: unknown };

describe("GET /api/v1/owners (F1)", () => {
  it("lists every current owner in display order with shares, tags, balances and loans", async () => {
    const w = await ownersWorld();
    const res = await getList(w.ownerLogin);
    expect(res.status).toBe(200);
    const { data } = await json(res);
    expect(data.houseName).toBe("Test House");
    expect(data.totalUnits).toBe(100);
    expect(data.owners.map((o: Item) => o.displayName)).toEqual(["Nasrin Ahmed", "Rayhan Ahmed", "Tanvir Ahmed", "Farzana Haque", "Sabrina Ahmed"]);
    const by = Object.fromEntries(data.owners.map((o: Item) => [o.displayName, o]));
    expect(by["Nasrin Ahmed"]).toMatchObject({
      units: 40,
      sharePercent: 40,
      status: "current",
      isViewer: true,
      responsibility: "Elder · signs bank cheques",
      balancePaisa: -500000,
      balanceLabel: "ADVANCE",
      loanOutstandingPaisa: 0,
      tags: { superAdmin: false, invitePending: false, noLogin: false },
    });
    expect(by["Rayhan Ahmed"]).toMatchObject({ isViewer: false, balanceLabel: "SETTLED", tags: { superAdmin: true } });
    expect(by["Tanvir Ahmed"]).toMatchObject({ balancePaisa: 805585, balanceLabel: "OWED", loanOutstandingPaisa: 3500000, tags: { noLogin: true } });
    expect(by["Sabrina Ahmed"]).toMatchObject({ units: 10, tags: { invitePending: true } });
    expect(data.formerOwners).toEqual([]);
  });

  it("puts former owners in their own list and shows new owners with 0 units", async () => {
    const w = await ownersWorld();
    const o = w.owners;
    await createShareSet(w.property.id, w.admin.id, "2026-09", { [o.nasrin.id]: 50, [o.rayhan.id]: 25, [o.tanvir.id]: 15, [o.farzana.id]: 10 });
    const karim = await createOwner(w.property.id, { displayName: "Karim", sortOrder: 9 });
    const { data } = await json(await getList(w.ownerLogin));
    expect(data.formerOwners).toEqual([expect.objectContaining({ id: o.sabrina.id, status: "former", leftMonth: "2026-09", units: 0 })]);
    expect(data.owners.map((x: Item) => x.id)).not.toContain(o.sabrina.id);
    expect(data.owners.at(-1)).toMatchObject({ id: karim.id, status: "new", units: 0, sharePercent: 0 });
  });

  it("orders by display order and then name", async () => {
    const w = await ownersWorld();
    await patch(w.adminLogin, w.owners.tanvir.id, { sortOrder: 0 });
    const { data } = await json(await getList(w.ownerLogin));
    expect(data.owners[0].displayName).toBe("Tanvir Ahmed");
  });

  it("needs a session", async () => {
    expect((await getList(null)).status).toBe(401);
  });
});

describe("GET /api/v1/owners/:id (F2)", () => {
  it("returns contact, yearly figures, oldest due month and share history", async () => {
    const w = await ownersWorld();
    const o = w.owners;
    await w.entry(o.nasrin.id, "ENTITLEMENT", 3000000, { entryDate: "2026-10-01" });
    await w.entry(o.nasrin.id, "PAYOUT", -3000000, { fundAccountId: w.cash.id, entryDate: "2026-10-05" });
    await w.entry(o.nasrin.id, "PAYOUT", -200000, { fundAccountId: w.cash.id, entryDate: "2026-10-06", voided: "Wrong owner" });
    const res = await getOne(w.ownerLogin, o.nasrin.id);
    expect(res.status).toBe(200);
    const { data } = await json(res);
    expect(data.owner).toMatchObject({
      id: o.nasrin.id,
      email: w.owner.email,
      phone: "01711000000",
      userName: "Nasrin Ahmed",
      year: 2026,
      entitlementPaisa: 3000000,
      paidOutPaisa: 3500000,
      balancePaisa: -700000,
      oldestDueMonth: null,
    });
    expect(data.owner.shareHistory.map((h: { effectiveMonth: string; units: number }) => [h.effectiveMonth, h.units])).toEqual([
      ["2026-06", 40],
      ["2026-01", 50],
    ]);
    expect(data.owner.shareHistory[0]).toMatchObject({ reason: "Gifted 10 units to Sabrina, deed 20 May 2026", savedBy: "Rayhan Ahmed" });
  });

  it("reports the oldest due month and filters yearly figures by ?year", async () => {
    const w = await ownersWorld();
    const res = await getOne(w.ownerLogin, w.owners.tanvir.id, "?year=2025");
    const { data } = await json(res);
    expect(data.owner).toMatchObject({ year: 2025, entitlementPaisa: 0, paidOutPaisa: 0, oldestDueMonth: "2026-10", email: null, phone: null, userName: null });
  });

  it("validates the year and 404s unknown, malformed or foreign ids", async () => {
    const w = await ownersWorld();
    expect((await getOne(w.ownerLogin, w.owners.tanvir.id, "?year=1999")).status).toBe(422);
    expect((await getOne(w.ownerLogin, "8d3c3e4a-3f43-4a5e-9a3c-2a8b1b1b1b1b")).status).toBe(404);
    expect((await getOne(w.ownerLogin, "nope")).status).toBe(404);
    const other = await prisma.property.create({ data: { name: "Other" } });
    const foreign = await createOwner(other.id);
    expect((await getOne(w.ownerLogin, foreign.id)).status).toBe(404);
  });
});

describe("POST /api/v1/owners (F7)", () => {
  it("links a user, defaulting the name, with 0 units", async () => {
    const w = await ownersWorld();
    const user = await createUser({ firstName: "Mitu" });
    await prisma.user.update({ where: { id: user.id }, data: { lastName: "Rahman" } });
    const res = await post(w.adminLogin, { userId: user.id });
    expect(res.status).toBe(201);
    const { data } = await json(res);
    expect(data.owner).toMatchObject({ displayName: "Mitu Rahman", initials: "MR", units: 0, status: "new", userId: user.id, sortOrder: 6 });
    expect(await lastAudit("owner.created", data.owner.id)).toBeTruthy();
  });

  it("creates a name-only owner and validates the body", async () => {
    const w = await ownersWorld();
    const res = await post(w.adminLogin, { displayName: "Estate of Karim Ahmed" });
    expect(res.status).toBe(201);
    expect((await json(res)).data.owner).toMatchObject({ userId: null, initials: "EA", tags: { noLogin: true } });
    const bad = await post(w.adminLogin, {});
    expect(bad.status).toBe(422);
    expect((await json(bad)).error.details.fields.displayName).toBeTruthy();
    expect((await post(w.adminLogin, { userId: "8d3c3e4a-3f43-4a5e-9a3c-2a8b1b1b1b1b" })).status).toBe(422);
  });

  it("refuses a deactivated user (create and link)", async () => {
    const w = await ownersWorld();
    const gone = await createUser({ status: "INACTIVE" });
    const created = await post(w.adminLogin, { userId: gone.id });
    expect(created.status).toBe(422);
    expect((await json(created)).error.details.fields.userId).toBe("That user is deactivated.");
    expect((await patch(w.adminLogin, w.owners.tanvir.id, { userId: gone.id })).status).toBe(422);
  });

  it("refuses a user who is already an owner", async () => {
    const w = await ownersWorld();
    const res = await post(w.adminLogin, { userId: w.owner.id });
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe("USER_ALREADY_OWNER");
  });

  it("is admin-only", async () => {
    const w = await ownersWorld();
    expect((await post(w.ownerLogin, { displayName: "X" })).status).toBe(403);
  });
});

describe("PATCH /api/v1/owners/:id (F8)", () => {
  it("renames and unlinks with an audit of changed fields", async () => {
    const w = await ownersWorld();
    const res = await patch(w.adminLogin, w.owners.nasrin.id, { displayName: "Estate of Nasrin Ahmed", userId: null, note: "Passed away Oct 2026" });
    expect(res.status).toBe(200);
    expect((await json(res)).data.owner).toMatchObject({ displayName: "Estate of Nasrin Ahmed", userId: null, tags: { noLogin: true } });
    const audit = await lastAudit("owner.updated", w.owners.nasrin.id);
    expect(audit).toMatchObject({ before: { displayName: "Nasrin Ahmed" }, after: { displayName: "Estate of Nasrin Ahmed", userId: null } });
  });

  it("skips the audit when nothing changes and refuses taken logins", async () => {
    const w = await ownersWorld();
    expect((await patch(w.adminLogin, w.owners.tanvir.id, { displayName: "Tanvir Ahmed" })).status).toBe(200);
    expect(await lastAudit("owner.updated", w.owners.tanvir.id)).toBeNull();
    const taken = await patch(w.adminLogin, w.owners.tanvir.id, { userId: w.owner.id });
    expect((await json(taken)).error.code).toBe("USER_ALREADY_OWNER");
  });

  it("is admin-only and 404s unknown ids", async () => {
    const w = await ownersWorld();
    expect((await patch(w.ownerLogin, w.owners.tanvir.id, { sortOrder: 1 })).status).toBe(403);
    expect((await patch(w.adminLogin, "8d3c3e4a-3f43-4a5e-9a3c-2a8b1b1b1b1b", { sortOrder: 1 })).status).toBe(404);
  });

  it("has no DELETE", () => {
    expect("DELETE" in one).toBe(false);
  });
});

describe("audit atomicity", () => {
  it("rolls back the owner when the audit insert fails", async () => {
    const w = await ownersWorld();
    const before = await prisma.owner.count();
    auditControl.fail = true;
    try {
      expect((await post(w.adminLogin, { displayName: "Ghost" })).status).toBe(500);
    } finally {
      auditControl.fail = false;
    }
    expect(await prisma.owner.count()).toBe(before);
  });
});
