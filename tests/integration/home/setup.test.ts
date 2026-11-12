// Home read model — first-run setup checklist and notices seam (Home PRD F12, F9).
import { describe, expect, it, vi } from "vitest";
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

describe("pinnedNotices (F9, NTC-01; Notices & Complaints N5)", () => {
  const notice = (propertyId: string, by: string, title: string, day: string, over: Record<string, unknown> = {}) =>
    prisma.notice.create({ data: { propertyId, title, body: `${title} body`, pinned: true, publishedAt: new Date(`${day}T04:00:00Z`), createdById: by, ...over } });

  it("is empty with no pinned notice", async () => {
    const p = await createProperty();
    const u = await createUser();
    expect(await pinnedNotices(p.id, u.id)).toEqual({ items: [], more: false });
  });

  it("returns up to 3 pinned notices newest first, with urgent and unread for the viewer", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-22T06:00:00Z") });
    try {
      const p = await createProperty();
      const admin = await createUser({ roles: ["SUPER_ADMIN"] });
      const owner = await createUser({ roles: ["OWNER"] });
      const water = await notice(p.id, admin.id, "Water tank", "2026-10-20", { priority: "URGENT", pinUntil: new Date("2026-10-26T00:00:00Z") });
      await notice(p.id, admin.id, "Tax", "2026-10-02");
      await notice(p.id, admin.id, "Lift", "2026-09-30");
      await notice(p.id, admin.id, "Old", "2026-09-01");
      await notice(p.id, admin.id, "Expired", "2026-10-21", { pinUntil: new Date("2026-10-21T00:00:00Z") });
      await notice(p.id, admin.id, "Archived", "2026-10-21", { archivedAt: new Date() });
      await notice(p.id, admin.id, "Unpinned", "2026-10-21", { pinned: false });
      await prisma.noticeRead.create({ data: { noticeId: water.id, userId: admin.id } });
      const forOwner = await pinnedNotices(p.id, owner.id);
      expect(forOwner.items.map((n) => [n.title, n.urgent, n.unread, n.date])).toEqual([
        ["Water tank", true, true, "2026-10-20"],
        ["Tax", false, true, "2026-10-02"],
        ["Lift", false, true, "2026-09-30"],
      ]);
      expect(forOwner.more).toBe(true);
      expect((await pinnedNotices(p.id, admin.id)).items[0].unread).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
