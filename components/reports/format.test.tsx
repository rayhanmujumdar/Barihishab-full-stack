import { describe, expect, it } from "vitest";
import { bigChange, bpPercent, changeText, reportDocTitle } from "./format";

describe("report display helpers", () => {
  it("shows whole percents, and <1% for tiny non-zero shares", () => {
    expect(bpPercent("en", 4506)).toBe("45%");
    expect(bpPercent("en", 40)).toBe("<1%");
    expect(bpPercent("en", 0)).toBe("0%");
    expect(bpPercent("bn", 4506)).toBe("৪৫%");
  });

  it("words changes with arrows (F8, Rule 12)", () => {
    expect(changeText("en", 10300000, 12500000).text).toBe("▼ down −৳22,000 (−17.6%)");
    expect(changeText("en", 120, 100).text).toBe("▲ up +৳0.20 (+20%)");
    expect(changeText("en", 5, 5).text).toBe("no change");
    expect(changeText("en", 5, 0).text).toBe("▲ up +৳0.05");
  });

  it("flags only changes above 20%", () => {
    expect(bigChange(630000, 400000)).toBe(230000);
    expect(bigChange(120, 100)).toBeNull();
    expect(bigChange(300000, 0)).toBe(300000);
    expect(bigChange(0, 0)).toBeNull();
    expect(bigChange(100, null)).toBeNull();
  });

  it("names PDF files like the PRD", () => {
    expect(reportDocTitle("monthly", { month: { key: "2026-10", status: "DRAFT" } })).toBe("BariHisab-Monthly-2026-10-DRAFT");
    expect(reportDocTitle("yearly", { year: 2026 })).toBe("BariHisab-Yearly-2026");
  });
});
