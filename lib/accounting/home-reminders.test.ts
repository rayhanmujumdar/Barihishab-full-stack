import { describe, expect, it } from "vitest";
import { pickReminders, reminderMonths, type ReminderInput } from "./home-reminders";

const flat3a = { name: "Flat 3A", tenantName: "Nusrat Jahan" };
const overdue = { id: "r1", ownerName: "Nasrin Ahmed", amountPaisa: 1000000, type: "ADVANCE" as const, neededBy: "2026-10-18" };

describe("reminderMonths (Home PRD F6, G4)", () => {
  it("has no rent reminder before the 10th", () => {
    expect(reminderMonths("2026-10-09", ["2026-10"])).toEqual({ closeMonth: null, rentMonth: null });
  });

  it("starts the rent reminder on the 10th while the month is open", () => {
    expect(reminderMonths("2026-10-10", ["2026-10"])).toEqual({ closeMonth: null, rentMonth: "2026-10" });
  });

  it("has no rent reminder when the current month is not open", () => {
    expect(reminderMonths("2026-10-22", ["2026-09"])).toEqual({ closeMonth: "2026-09", rentMonth: null });
  });

  it("asks to close an older month from the 1st of the next month", () => {
    expect(reminderMonths("2026-11-01", ["2026-10", "2026-11"])).toEqual({ closeMonth: "2026-10", rentMonth: null });
  });

  it("names the oldest open month when several are behind", () => {
    expect(reminderMonths("2026-12-15", ["2026-11", "2026-10", "2026-12"])).toEqual({ closeMonth: "2026-10", rentMonth: "2026-12" });
  });
});

describe("pickReminders", () => {
  const base: ReminderInput = { closeMonth: null, rentMonth: null, unpaid: {}, approvedOverdue: [], hidden: [] };

  it("returns nothing when nothing is due", () => {
    expect(pickReminders(base)).toEqual([]);
  });

  it("lists unpaid units on the rent reminder", () => {
    expect(pickReminders({ ...base, rentMonth: "2026-10", unpaid: { "2026-10": [flat3a] } })).toEqual([{ key: "RENT_STATUS", kind: "RENT_STATUS", month: "2026-10", units: [flat3a] }]);
  });

  it("skips the rent reminder when every unit has paid", () => {
    expect(pickReminders({ ...base, rentMonth: "2026-10", unpaid: { "2026-10": [] } })).toEqual([]);
    expect(pickReminders({ ...base, rentMonth: "2026-10" })).toEqual([]);
  });

  it("always shows the close reminder, with any unpaid units", () => {
    expect(pickReminders({ ...base, closeMonth: "2026-10" })).toEqual([{ key: "CLOSE_MONTH", kind: "CLOSE_MONTH", month: "2026-10", units: [] }]);
  });

  it("orders close → rent → approved-unpaid and caps at two", () => {
    const r = pickReminders({ ...base, closeMonth: "2026-10", rentMonth: "2026-11", unpaid: { "2026-10": [flat3a], "2026-11": [flat3a] }, approvedOverdue: [overdue] });
    expect(r.map((x) => x.kind)).toEqual(["CLOSE_MONTH", "RENT_STATUS"]);
    expect(r[0]).toMatchObject({ units: [flat3a] });
  });

  it("gives each overdue request its own reminder", () => {
    const r = pickReminders({ ...base, approvedOverdue: [overdue, { ...overdue, id: "r2" }] });
    expect(r).toEqual([
      { key: "APPROVED_UNPAID:r1", kind: "APPROVED_UNPAID", request: overdue },
      { key: "APPROVED_UNPAID:r2", kind: "APPROVED_UNPAID", request: { ...overdue, id: "r2" } },
    ]);
  });

  it("drops hidden reminders before applying the cap", () => {
    const r = pickReminders({ ...base, closeMonth: "2026-10", rentMonth: "2026-11", unpaid: { "2026-11": [flat3a] }, approvedOverdue: [overdue], hidden: ["CLOSE_MONTH"] });
    expect(r.map((x) => x.key)).toEqual(["RENT_STATUS", "APPROVED_UNPAID:r1"]);
  });
});
