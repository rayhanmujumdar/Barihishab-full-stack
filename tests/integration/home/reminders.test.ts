// Home read model — reminders (Home PRD F6, G4, Rule 9).
import { afterEach, describe, expect, it, vi } from "vitest";
import { homeReminders } from "@/lib/home/reminders";
import { prisma } from "@/lib/prisma";
import { createMoneyRequest, createPeriod, createTxn } from "../../helpers/factory";
import { distributionWorld } from "../../helpers/distribution";
import { freezeDhaka } from "../../helpers/money";

afterEach(() => vi.useRealTimers());

// Flat 3A (Nusrat Jahan) has no October rent in the distribution world.
const flat3a = { name: "Flat 3A", tenantName: "Nusrat Jahan" };

describe("homeReminders", () => {
  it("has no rent reminder on the 9th", async () => {
    await freezeDhaka(vi, "2026-10-09T06:00:00Z");
    const w = await distributionWorld();
    expect(await homeReminders(w.property.id)).toEqual([]);
  });

  it("names the unpaid units from the 10th", async () => {
    await freezeDhaka(vi, "2026-10-10T06:00:00Z");
    const w = await distributionWorld();
    expect(await homeReminders(w.property.id)).toEqual([{ key: "RENT_STATUS", kind: "RENT_STATUS", month: "2026-10", units: [flat3a] }]);
  });

  it("stops once the rent is recorded", async () => {
    await freezeDhaka(vi, "2026-10-22T06:00:00Z");
    const w = await distributionWorld();
    await createTxn({ propertyId: w.property.id, periodId: w.oct.id, fundAccountId: w.cash.id, createdById: w.admin.id, kind: "INCOME", categoryId: w.categories.RENT.id, unitId: w.units.flat3a.id, amountPaisa: 1800000 });
    expect(await homeReminders(w.property.id)).toEqual([]);
  });

  it("asks to close October on 1 November, most urgent first", async () => {
    await freezeDhaka(vi, "2026-11-01T06:00:00Z");
    const w = await distributionWorld();
    await createPeriod(w.property.id, "2026-11");
    const r = await homeReminders(w.property.id);
    expect(r).toEqual([{ key: "CLOSE_MONTH", kind: "CLOSE_MONTH", month: "2026-10", units: [flat3a] }]);
  });

  it("reminds about an approved request past its needed-by date", async () => {
    await freezeDhaka(vi, "2026-10-05T06:00:00Z");
    const w = await distributionWorld();
    const r = await createMoneyRequest({ propertyId: w.property.id, ownerId: w.owners.nasrin.id, createdById: w.owner.id, status: "APPROVED", amountPaisa: 1000000, approvedPaisa: 800000, neededBy: "2026-10-04" });
    await createMoneyRequest({ propertyId: w.property.id, ownerId: w.owners.nasrin.id, createdById: w.owner.id, status: "APPROVED", neededBy: "2026-10-05" });
    expect(await homeReminders(w.property.id)).toEqual([
      { key: `APPROVED_UNPAID:${r.id}`, kind: "APPROVED_UNPAID", request: { id: r.id, ownerName: "Nasrin Ahmed", amountPaisa: 800000, type: "ADVANCE", neededBy: "2026-10-04" } },
    ]);
  });

  it("drops reminders hidden for today", async () => {
    await freezeDhaka(vi, "2026-10-12T06:00:00Z");
    const w = await distributionWorld();
    expect(await homeReminders(w.property.id, ["RENT_STATUS"])).toEqual([]);
  });

  it("ignores other properties' periods", async () => {
    await freezeDhaka(vi, "2026-10-12T06:00:00Z");
    const w = await distributionWorld();
    await prisma.period.update({ where: { id: w.oct.id }, data: { status: "CLOSED" } });
    expect(await homeReminders(w.property.id)).toEqual([]);
  });
});
