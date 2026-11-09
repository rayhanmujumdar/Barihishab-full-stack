import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as shares from "@/app/api/v1/owners/shares/route";
import { setInForce } from "@/lib/accounting/owners";
import { loadShareSets } from "@/lib/owners/share-service";
import { prisma } from "@/lib/prisma";
import { createOwner, createPeriod } from "../../helpers/factory";
import { apiRequest, json, params, type Login } from "../../helpers/http";
import { freezeDhaka, moneyPost } from "../../helpers/money";
import { ownersWorld } from "../../helpers/owners";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

type World = Awaited<ReturnType<typeof ownersWorld>>;
const save = (login: Login, body: unknown, key?: string) => shares.POST(moneyPost("/owners/shares", login, body, key), params({}));
const timeline = (login: Login) => shares.GET(apiRequest("/owners/shares", { login }), params({}));

/** Sample gift share set (Owners PRD flow 6.4), effective October unless overridden. */
const gift = (w: World, extra: Record<string, unknown> = {}) => ({
  effectiveMonth: "2026-10",
  reason: "Gifted 10 units to Sabrina (deed 20 May 2026)",
  items: [
    { ownerId: w.owners.nasrin.id, units: 30 },
    { ownerId: w.owners.rayhan.id, units: 25 },
    { ownerId: w.owners.tanvir.id, units: 15 },
    { ownerId: w.owners.farzana.id, units: 10 },
    { ownerId: w.owners.sabrina.id, units: 20 },
  ],
  ...extra,
});

describe("POST /api/v1/owners/shares (F6)", () => {
  it("saves one set from an open month without touching earlier months", async () => {
    const w = await ownersWorld();
    const res = await save(w.adminLogin, gift(w));
    expect(res.status).toBe(201);
    const { data } = await json(res);
    expect(data.shareSet).toMatchObject({ effectiveMonth: "2026-10", totalUnits: 100, replaced: false, savedBy: "Rayhan Ahmed" });
    expect(data.shareSet.items).toContainEqual({ ownerId: w.owners.sabrina.id, displayName: "Sabrina Ahmed", units: 20, sharePercent: 20 });
    const sets = await loadShareSets(prisma, w.property.id);
    expect(setInForce(sets, "2026-09")?.id).toBe(w.sets.jun.id);
    const audit = await prisma.auditLog.findFirst({ where: { action: "share_set.saved", entityId: data.shareSet.id } });
    expect(audit).toMatchObject({ reason: "Gifted 10 units to Sabrina (deed 20 May 2026)" });
    expect((audit!.before as { effectiveMonth: string }).effectiveMonth).toBe("2026-06");
  });

  it("requires a reason, positive total, unique owners of this property", async () => {
    const w = await ownersWorld();
    const blank = await save(w.adminLogin, gift(w, { reason: "  " }));
    expect(blank.status).toBe(422);
    expect((await json(blank)).error.details.fields.reason).toBe("A reason is required for every share change.");

    const zero = await save(w.adminLogin, gift(w, { items: [{ ownerId: w.owners.nasrin.id, units: 0 }] }));
    expect((await json(zero)).error.details.fields.items).toBe("Total share units must be above zero.");

    const dup = await save(w.adminLogin, gift(w, { items: [{ ownerId: w.owners.nasrin.id, units: 1 }, { ownerId: w.owners.nasrin.id, units: 2 }] }));
    expect(dup.status).toBe(422);

    const other = await prisma.property.create({ data: { name: "Other" } });
    const foreign = await createOwner(other.id);
    expect((await save(w.adminLogin, gift(w, { items: [{ ownerId: foreign.id, units: 1 }] }))).status).toBe(422);
    expect((await save(w.adminLogin, gift(w, { items: [{ ownerId: w.owners.nasrin.id, units: 1.5 }] }))).status).toBe(422);
  });

  it("refuses a closed month or one on/before the latest closed month", async () => {
    const w = await ownersWorld();
    const closed = await save(w.adminLogin, gift(w, { effectiveMonth: "2026-09" }));
    expect(closed.status).toBe(409);
    const body = await json(closed);
    expect(body.error.code).toBe("PERIOD_CLOSED");
    expect(body.error.details.fields.effectiveMonth).toBe("That month is closed. Pick an open month or a later one.");
    expect((await save(w.adminLogin, gift(w, { effectiveMonth: "2026-08" }))).status).toBe(409);
  });

  it("allows the month after the latest period but not later ones", async () => {
    const w = await ownersWorld();
    expect((await save(w.adminLogin, gift(w, { effectiveMonth: "2026-11" }))).status).toBe(201);
    const far = await save(w.adminLogin, gift(w, { effectiveMonth: "2027-01" }));
    expect(far.status).toBe(422);
    expect((await json(far)).error.details.fields.effectiveMonth).toBeTruthy();
  });

  it("refuses a month with no period that is not the next month (gap before an open month)", async () => {
    const w = await ownersWorld();
    await createPeriod(w.property.id, "2026-12");
    expect((await save(w.adminLogin, gift(w, { effectiveMonth: "2026-11" }))).status).toBe(422);
  });

  it("replaces a same-month set but keeps it in history", async () => {
    const w = await ownersWorld();
    const first = (await json(await save(w.adminLogin, gift(w)))).data.shareSet;
    const second = (await json(await save(w.adminLogin, gift(w, { reason: "Corrected deed" })))).data.shareSet;
    const { data } = await json(await timeline(w.ownerLogin));
    const oct = data.items.filter((s: { effectiveMonth: string }) => s.effectiveMonth === "2026-10");
    expect(oct.map((s: { id: string; replaced: boolean }) => [s.id, s.replaced])).toEqual([
      [second.id, false],
      [first.id, true],
    ]);
  });

  it("leaves one active set when two saves for the same month race", async () => {
    const w = await ownersWorld();
    const results = await Promise.all([save(w.adminLogin, gift(w)), save(w.adminLogin, gift(w, { reason: "Other reason" }))]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(await prisma.shareSet.count({ where: { effectiveFrom: new Date("2026-10-01T00:00:00Z"), replacedAt: null } })).toBe(1);
  });

  it("gives omitted owners 0 units", async () => {
    const w = await ownersWorld();
    const items = gift(w).items.filter((i) => i.ownerId !== w.owners.sabrina.id);
    await save(w.adminLogin, gift(w, { items }));
    const sets = await loadShareSets(prisma, w.property.id);
    expect(setInForce(sets, "2026-10")?.items.find((i) => i.ownerId === w.owners.sabrina.id)).toBeUndefined();
  });

  it("replays the same Idempotency-Key", async () => {
    const w = await ownersWorld();
    const key = randomUUID();
    const a = await json(await save(w.adminLogin, gift(w), key));
    const b = await json(await save(w.adminLogin, gift(w), key));
    expect(b).toEqual(a);
    expect(await prisma.shareSet.count()).toBe(3);
  });

  it("is admin-only", async () => {
    const w = await ownersWorld();
    expect((await save(w.ownerLogin, gift(w))).status).toBe(403);
  });
});

describe("GET /api/v1/owners/shares (F5)", () => {
  it("lists every set newest first with reason, saver and changed owners", async () => {
    const w = await ownersWorld();
    const res = await timeline(w.ownerLogin);
    expect(res.status).toBe(200);
    const { data } = await json(res);
    expect(data.items.map((s: { effectiveMonth: string }) => s.effectiveMonth)).toEqual(["2026-06", "2026-01"]);
    expect(data.items[0]).toMatchObject({ reason: "Gifted 10 units to Sabrina, deed 20 May 2026", savedBy: "Rayhan Ahmed", totalUnits: 100 });
    expect(data.items[0].items).toHaveLength(5);
  });

  it("shows an owner moved to 0 only in the set that took them to 0", async () => {
    const w = await ownersWorld();
    const items = gift(w).items.map((i) => (i.ownerId === w.owners.sabrina.id ? { ...i, units: 0 } : i));
    await save(w.adminLogin, gift(w, { items }));
    await save(w.adminLogin, gift(w, { effectiveMonth: "2026-11", items, reason: "Again" }));
    const { data } = await json(await timeline(w.ownerLogin));
    const ids = (s: { items: { ownerId: string }[] }) => s.items.map((i) => i.ownerId);
    expect(ids(data.items[1])).toContain(w.owners.sabrina.id);
    expect(ids(data.items[0])).not.toContain(w.owners.sabrina.id);
  });
});
