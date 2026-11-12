import { describe, expect, it } from "vitest";
import { canRemind, isPinnedOn, orderNotices } from "./rules";

const pin = (over: Partial<Parameters<typeof isPinnedOn>[0]> = {}) => ({ pinned: true, pinUntil: null, archivedAt: null, ...over });

describe("isPinnedOn", () => {
  it("is pinned with no end date", () => {
    expect(isPinnedOn(pin(), "2026-10-22")).toBe(true);
  });

  it("stays pinned through the Pin until day and unpins the day after (§12.1)", () => {
    expect(isPinnedOn(pin({ pinUntil: "2026-10-26" }), "2026-10-26")).toBe(true);
    expect(isPinnedOn(pin({ pinUntil: "2026-10-26" }), "2026-10-27")).toBe(false);
  });

  it("is never pinned when unpinned or archived", () => {
    expect(isPinnedOn(pin({ pinned: false }), "2026-10-22")).toBe(false);
    expect(isPinnedOn(pin({ archivedAt: new Date("2026-10-21T00:00:00Z") }), "2026-10-22")).toBe(false);
  });
});

describe("orderNotices", () => {
  it("puts pinned first (newest first), then the rest newest first — Nasrin's list on 22 Oct", () => {
    const water = { id: "water", pinnedNow: true, publishedAt: new Date("2026-10-20T04:00:00Z") };
    const closed = { id: "closed", pinnedNow: false, publishedAt: new Date("2026-10-03T04:00:00Z") };
    const tax = { id: "tax", pinnedNow: true, publishedAt: new Date("2026-10-02T04:00:00Z") };
    const old = { id: "old", pinnedNow: false, publishedAt: new Date("2026-09-01T04:00:00Z") };
    expect(orderNotices([old, closed, tax, water]).map((n) => n.id)).toEqual(["water", "tax", "closed", "old"]);
  });

  it("drops the water notice among unpinned ones once it expires (27 Oct)", () => {
    const water = { id: "water", pinnedNow: false, publishedAt: new Date("2026-10-20T04:00:00Z") };
    const closed = { id: "closed", pinnedNow: false, publishedAt: new Date("2026-10-03T04:00:00Z") };
    const tax = { id: "tax", pinnedNow: true, publishedAt: new Date("2026-10-02T04:00:00Z") };
    expect(orderNotices([closed, water, tax]).map((n) => n.id)).toEqual(["tax", "water", "closed"]);
  });
});

describe("canRemind", () => {
  const urgent = { priority: "URGENT" as const, archivedAt: null, lastRemindedOn: null };

  it("allows an urgent live notice not reminded today", () => {
    expect(canRemind(urgent, "2026-10-22")).toBe(null);
    expect(canRemind({ ...urgent, lastRemindedOn: "2026-10-21" }, "2026-10-22")).toBe(null);
  });

  it("refuses normal, archived and already-reminded-today notices", () => {
    expect(canRemind({ ...urgent, priority: "NORMAL" }, "2026-10-22")).toBe("NOT_URGENT");
    expect(canRemind({ ...urgent, archivedAt: new Date() }, "2026-10-22")).toBe("NOTICE_ARCHIVED");
    expect(canRemind({ ...urgent, lastRemindedOn: "2026-10-22" }, "2026-10-22")).toBe("REMINDER_ALREADY_SENT");
  });
});
