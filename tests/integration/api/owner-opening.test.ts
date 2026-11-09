import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as opening from "@/app/api/v1/owners/[id]/opening/route";
import { prisma } from "@/lib/prisma";
import { createOwner, createPeriod, setPeriodStatus } from "../../helpers/factory";
import { apiRequest, json, params, type Login } from "../../helpers/http";
import { freezeDhaka } from "../../helpers/money";
import { ownersWorld } from "../../helpers/owners";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

const put = (login: Login, id: string, body: unknown) => opening.PUT(apiRequest(`/owners/${id}/opening`, { login, method: "PUT", body }), params({ id }));

/** A world where no month is closed yet (setup phase). */
async function setupWorld() {
  const w = await ownersWorld();
  await setPeriodStatus(w.sep.id, "OPEN");
  const aug = await createPeriod(w.property.id, "2026-08");
  const karim = await createOwner(w.property.id, { displayName: "Karim" });
  return { ...w, aug, karim };
}

describe("PUT /api/v1/owners/:id/opening (F10)", () => {
  it("creates then edits one Opening entry in the earliest period", async () => {
    const w = await setupWorld();
    const first = await put(w.adminLogin, w.karim.id, { amountPaisa: 2989440, note: "Owed from the 2025 notebook" });
    expect(first.status).toBe(200);
    expect((await json(first)).data).toMatchObject({ entry: { type: "OPENING", amountPaisa: 2989440, month: "2026-08", date: "2026-08-01" }, balancePaisa: 2989440 });
    const second = await put(w.adminLogin, w.karim.id, { amountPaisa: -3000000, note: "Advance from the notebook" });
    expect((await json(second)).data.balancePaisa).toBe(-3000000);
    const rows = await prisma.ownerLedgerEntry.findMany({ where: { ownerId: w.karim.id } });
    expect(rows).toHaveLength(1);
    const audit = await prisma.auditLog.findFirst({ where: { action: "ledger.opening_set", entityId: rows[0].id }, orderBy: { id: "desc" } });
    expect(audit).toMatchObject({ before: { amountPaisa: 2989440 }, after: { amountPaisa: -3000000 } });
  });

  it("locks once any month is closed", async () => {
    const w = await ownersWorld();
    const res = await put(w.adminLogin, w.owners.rayhan.id, { amountPaisa: 100 });
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe("OPENING_LOCKED");
  });

  it("validates, 404s and is admin-only", async () => {
    const w = await setupWorld();
    expect((await put(w.adminLogin, w.karim.id, { amountPaisa: 0 })).status).toBe(422);
    expect((await put(w.adminLogin, "8d3c3e4a-3f43-4a5e-9a3c-2a8b1b1b1b1b", { amountPaisa: 5 })).status).toBe(404);
    expect((await put(w.ownerLogin, w.karim.id, { amountPaisa: 5 })).status).toBe(403);
  });
});
