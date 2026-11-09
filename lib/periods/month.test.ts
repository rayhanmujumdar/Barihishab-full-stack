import { describe, expect, it } from "vitest";
import { currentMonthKey, daysFromPeriod, isMonthKey, monthDate, monthKey, monthLabel, addMonths } from "./month";

describe("month keys", () => {
  it("validates YYYY-MM", () => {
    expect(isMonthKey("2026-10")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-1")).toBe(false);
    expect(isMonthKey("26-10")).toBe(false);
  });

  it("round-trips between key and the 1st-of-month date", () => {
    expect(monthDate("2026-10").toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(monthKey(new Date("2026-10-01T00:00:00Z"))).toBe("2026-10");
  });

  it("uses the Asia/Dhaka calendar for the current month", () => {
    // 31 Oct 18:30 UTC is already 1 Nov 00:30 in Dhaka (UTC+6).
    expect(currentMonthKey(new Date("2026-10-31T18:30:00Z"))).toBe("2026-11");
    expect(currentMonthKey(new Date("2026-10-31T17:59:00Z"))).toBe("2026-10");
  });
});

describe("addMonths", () => {
  it("moves across year boundaries", () => {
    expect(addMonths("2026-10", 1)).toBe("2026-11");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
});

describe("monthLabel", () => {
  it("names the month in both languages", () => {
    expect(monthLabel("en", "2026-10")).toBe("October 2026");
    expect(monthLabel("bn", "2026-10")).toBe("অক্টোবর ২০২৬");
  });
});

describe("daysFromPeriod", () => {
  it("is 0 inside the month and counts days outside it", () => {
    expect(daysFromPeriod("2026-10-15", "2026-10")).toBe(0);
    expect(daysFromPeriod("2026-10-01", "2026-10")).toBe(0);
    expect(daysFromPeriod("2026-10-31", "2026-10")).toBe(0);
    expect(daysFromPeriod("2026-11-03", "2026-10")).toBe(3);
    expect(daysFromPeriod("2026-08-16", "2026-10")).toBe(46);
    expect(daysFromPeriod("2026-12-15", "2026-10")).toBe(45);
  });
});
