import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as one from "@/app/api/v1/owners/[id]/route";
import * as statementRoute from "@/app/api/v1/owners/[id]/statement/route";
import { prisma } from "@/lib/prisma";
import { createOwner, createPeriod, createLedgerEntry, setPeriodStatus } from "../../helpers/factory";
import { apiRequest, json, params, type Login } from "../../helpers/http";
import { freezeDhaka } from "../../helpers/money";
import { ownersWorld } from "../../helpers/owners";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

const get = (login: Login, id: string, query = "") => statementRoute.GET(apiRequest(`/owners/${id}/statement${query}`, { login }), params({ id }));

/** Owners PRD §10 worked example for Nasrin (Aug 2026 → Latest). */
async function worked() {
  const w = await ownersWorld();
  const nasrin = await createOwner(w.property.id, { displayName: "Nasrin (example)" });
  const months: Record<string, string> = {};
  for (const m of ["2026-07", "2026-08"]) months[m] = (await createPeriod(w.property.id, m)).id;
  months["2026-09"] = w.sep.id;
  months["2026-10"] = w.oct.id;
  await setPeriodStatus(w.sep.id, "OPEN");
  const e = (month: string, type: Parameters<typeof createLedgerEntry>[0]["type"], amountPaisa: number, date: string) =>
    createLedgerEntry({
      propertyId: w.property.id,
      ownerId: nasrin.id,
      periodId: months[month],
      createdById: w.admin.id,
      type,
      amountPaisa,
      entryDate: date,
      fundAccountId: type === "PAYOUT" || type === "ADVANCE" ? w.cash.id : null,
    });
  await e("2026-07", "OPENING", 2989440, "2026-07-01");
  await e("2026-08", "PAYOUT", -2989440, "2026-08-05");
  await e("2026-08", "ENTITLEMENT", 3477760, "2026-08-31");
  await e("2026-09", "PAYOUT", -3477760, "2026-09-05");
  await e("2026-09", "ENTITLEMENT", 3481560, "2026-09-30");
  await e("2026-10", "PAYOUT", -3481560, "2026-10-05");
  await e("2026-10", "ADVANCE", -500000, "2026-10-12");
  for (const m of ["2026-07", "2026-08", "2026-09"]) await setPeriodStatus(months[m], "CLOSED");
  return { ...w, nasrin };
}

describe("GET /api/v1/owners/:id/statement (F3)", () => {
  it("reproduces the worked example", async () => {
    const w = await worked();
    const res = await get(w.ownerLogin, w.nasrin.id, "?from=2026-08&to=latest");
    expect(res.status).toBe(200);
    const { data } = await json(res);
    expect(data).toMatchObject({ from: "2026-08", to: "latest", broughtForwardPaisa: 2989440, closingPaisa: -500000 });
    expect(data.rows.map((r: { type: string; runningPaisa: number }) => [r.type, r.runningPaisa])).toEqual([
      ["PAYOUT", 0],
      ["ENTITLEMENT", 3477760],
      ["PAYOUT", 0],
      ["ENTITLEMENT", 3481560],
      ["PAYOUT", 0],
      ["ADVANCE", -500000],
    ]);
    expect(data.totals).toEqual({ PAYOUT: -9948760, ENTITLEMENT: 6959320, ADVANCE: -500000 });
    expect(data.rows[0]).toMatchObject({ date: "2026-08-05", month: "2026-08", fundAccountName: "Cash — with Rayhan", recordedBy: "Rayhan Ahmed", attachments: [] });
  });

  it("defaults to January of this year → latest and matches the detail balance", async () => {
    const w = await worked();
    const { data } = await json(await get(w.ownerLogin, w.nasrin.id));
    expect(data).toMatchObject({ from: "2026-01", to: "latest", broughtForwardPaisa: 0, closingPaisa: -500000 });
    expect(data.rows).toHaveLength(7);
    const detail = await json(await one.GET(apiRequest(`/owners/${w.nasrin.id}`, { login: w.ownerLogin }), params({ id: w.nasrin.id })));
    expect(detail.data.owner.balancePaisa).toBe(data.closingPaisa);
  });

  it("handles a closed range, an empty range and from > to", async () => {
    const w = await worked();
    const aug = (await json(await get(w.ownerLogin, w.nasrin.id, "?from=2026-08&to=2026-08"))).data;
    expect(aug).toMatchObject({ to: "2026-08", closingPaisa: 3477760 });
    const empty = (await json(await get(w.ownerLogin, w.nasrin.id, "?from=2027-01&to=2027-02"))).data;
    expect(empty).toMatchObject({ rows: [], broughtForwardPaisa: -500000, closingPaisa: -500000 });
    expect((await get(w.ownerLogin, w.nasrin.id, "?from=2026-09&to=2026-08")).status).toBe(422);
    expect((await get(w.ownerLogin, w.nasrin.id, "?from=2026-13")).status).toBe(422);
  });

  it("keeps a voided payout and its reversal, with void details", async () => {
    const w = await ownersWorld();
    const f = w.owners.farzana.id;
    const p = await w.entry(f, "PAYOUT", -400000, { fundAccountId: w.cash.id, voided: "Wrong owner", entryDate: "2026-10-15" });
    await w.entry(f, "REVERSAL", 400000, { fundAccountId: w.cash.id, reversesId: p.id, entryDate: "2026-10-16" });
    await w.entry(f, "ADJUSTMENT", 1000, { referencePeriodId: w.sep.id, entryDate: "2026-10-17" });
    const { data } = await json(await get(w.ownerLogin, f));
    expect(data.rows.map((r: { type: string; voided: boolean; runningPaisa: number }) => [r.type, r.voided, r.runningPaisa])).toEqual([
      ["OPENING", false, 870390],
      ["PAYOUT", true, 470390],
      ["REVERSAL", false, 870390],
      ["ADJUSTMENT", false, 871390],
    ]);
    expect(data.rows[1]).toMatchObject({ voidReason: "Wrong owner" });
    expect(data.rows[2]).toMatchObject({ reversesId: p.id });
    expect(data.owner).toMatchObject({ id: f, displayName: "Farzana Haque", units: 10, sharePercent: 10 });
  });

  it("is open to every owner and 404s unknown ids", async () => {
    const w = await ownersWorld();
    expect((await get(w.ownerLogin, w.owners.tanvir.id)).status).toBe(200);
    expect((await get(w.ownerLogin, "8d3c3e4a-3f43-4a5e-9a3c-2a8b1b1b1b1b")).status).toBe(404);
    expect(await prisma.owner.count()).toBe(5);
  });
});
