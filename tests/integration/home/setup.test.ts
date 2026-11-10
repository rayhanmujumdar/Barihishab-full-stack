// Home read model — first-run setup checklist and notices seam (Home PRD F12, F9).
import { describe, expect, it } from "vitest";
import { pinnedNotices } from "@/lib/home/notices";
import { setupChecklist } from "@/lib/home/setup";
import { prisma } from "@/lib/prisma";
import { createFund, createLedgerEntry, createOwner, createPeriod, createProperty, createShareSet, createUser } from "../../helpers/factory";

const done = (s: Awaited<ReturnType<typeof setupChecklist>>) => Object.fromEntries((s?.steps ?? []).map((x) => [x.key, x.done]));

describe("setupChecklist (F12)", () => {
  it("has only House info done on a fresh install", async () => {
    const p = await createProperty();
    const admin = await createUser({ roles: ["SUPER_ADMIN"] });
    const s = await setupChecklist(p.id, admin.id);
    expect(s?.steps.map((x) => x.key)).toEqual(["HOUSE", "FUNDS", "SHARES", "OPENINGS", "FIRST_MONTH", "INVITES"]);
    expect(done(s)).toEqual({ HOUSE: true, FUNDS: false, SHARES: false, OPENINGS: false, FIRST_MONTH: false, INVITES: false });
  });

  it("ticks steps as they are done and disappears when all are", async () => {
    const p = await createProperty();
    const admin = await createUser({ roles: ["SUPER_ADMIN"] });
    await createFund(p.id);
    const mine = await createOwner(p.id, { userId: admin.id });
    await createShareSet(p.id, admin.id, "2026-10", { [mine.id]: 10 });
    const oct = await createPeriod(p.id, "2026-10");
    expect(done(await setupChecklist(p.id, admin.id))).toMatchObject({ FUNDS: true, SHARES: true, FIRST_MONTH: true, OPENINGS: false, INVITES: false });

    await createLedgerEntry({ propertyId: p.id, ownerId: mine.id, periodId: oct.id, createdById: admin.id, type: "OPENING", amountPaisa: 100 });
    // Linking only the viewer's own owner record does not count as inviting owners.
    expect(done(await setupChecklist(p.id, admin.id))).toMatchObject({ OPENINGS: true, INVITES: false });

    const nasrin = await createUser({ roles: ["OWNER"], status: "INVITED", password: null });
    await createOwner(p.id, { userId: nasrin.id });
    expect(await setupChecklist(p.id, admin.id)).toBeNull();
  });

  it("counts a closed month as opening balances done", async () => {
    const p = await createProperty();
    const admin = await createUser({ roles: ["SUPER_ADMIN"] });
    await createPeriod(p.id, "2026-09", "CLOSED");
    expect(done(await setupChecklist(p.id, admin.id))).toMatchObject({ OPENINGS: true, FIRST_MONTH: true });
  });

  it("needs a house name", async () => {
    const p = await prisma.property.create({ data: { name: " " } });
    const admin = await createUser({ roles: ["SUPER_ADMIN"] });
    expect(done(await setupChecklist(p.id, admin.id)).HOUSE).toBe(false);
  });
});

describe("pinnedNotices seam (F9, NTC-01)", () => {
  it("is empty until the Notices section exists", async () => {
    const p = await createProperty();
    const u = await createUser();
    expect(await pinnedNotices(p.id, u.id)).toEqual({ items: [], more: false });
  });
});
