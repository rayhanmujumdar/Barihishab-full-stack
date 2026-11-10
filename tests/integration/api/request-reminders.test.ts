import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { queueRequestReminders, requestReminders } from "@/lib/requests/reminders";
import { createMoneyRequest } from "../../helpers/factory";
import { freezeDhaka } from "../../helpers/money";
import { outbox, requestsWorld } from "../../helpers/requests";

beforeEach(() => freezeDhaka(vi));
afterEach(() => vi.useRealTimers());

describe("request reminders (F13, G14)", () => {
  it("flags requests pending over 3 days and approved ones past their needed-by date", async () => {
    const w = await requestsWorld();
    const p = w.property.id;
    const old = await createMoneyRequest({ propertyId: p, ownerId: w.owners.tanvir.id, createdById: w.tanvirUser.id, createdAt: new Date("2026-10-15T06:00:00Z") });
    await createMoneyRequest({ propertyId: p, ownerId: w.owners.tanvir.id, createdById: w.tanvirUser.id, createdAt: new Date("2026-10-18T06:00:00Z") });
    const late = await createMoneyRequest({ propertyId: p, ownerId: w.owners.nasrin.id, createdById: w.owner.id, status: "APPROVED", neededBy: "2026-10-19" });
    await createMoneyRequest({ propertyId: p, ownerId: w.owners.nasrin.id, createdById: w.owner.id, status: "DISBURSED", neededBy: "2026-10-01" });
    const list = await requestReminders(p);
    expect(list.map((r) => [r.id, r.kind])).toEqual([
      [old.id, "PENDING_3_DAYS"],
      [late.id, "APPROVED_PAST_DUE"],
    ]);
  });

  it("emails each Super Admin once per request and reason, however often the worker runs", async () => {
    const w = await requestsWorld();
    const old = await createMoneyRequest({ propertyId: w.property.id, ownerId: w.owners.tanvir.id, createdById: w.tanvirUser.id, createdAt: new Date("2026-10-15T06:00:00Z") });
    expect(await queueRequestReminders()).toBe(1);
    expect(await queueRequestReminders()).toBe(0);
    const mails = await outbox(old.id, "REMINDER");
    expect(mails.map((m) => m.toUserId)).toEqual([w.admin.id]);
    expect(mails[0].payload).toMatchObject({ reminderKind: "PENDING_3_DAYS" });
    // Requesters never get reminders.
    expect(await prisma.emailOutbox.count({ where: { toUserId: w.tanvirUser.id, template: "REQUEST_UPDATE" } })).toBe(0);
  });
});
