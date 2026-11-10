import { describe, expect, it } from "vitest";
import { HIDDEN_COOKIE, hideToday, hiddenToday, readCookie } from "./hidden";

describe("Hide today cookie (Home PRD F6, design D8)", () => {
  it("returns the keys hidden on the given day only", () => {
    const value = hideToday(hideToday(null, "RENT_STATUS", "2026-10-11"), "CLOSE_MONTH", "2026-10-12");
    expect(hiddenToday(value, "2026-10-12")).toEqual(["CLOSE_MONTH"]);
    expect(hiddenToday(value, "2026-10-13")).toEqual([]);
  });

  it("drops stale days when adding and does not duplicate keys", () => {
    const a = hideToday(hideToday("RENT_STATUS@2026-10-01", "RENT_STATUS", "2026-10-12"), "RENT_STATUS", "2026-10-12");
    expect(a).toBe("RENT_STATUS@2026-10-12");
  });

  it("keeps request keys with a colon", () => {
    const v = hideToday(null, "APPROVED_UNPAID:6f1c", "2026-10-12");
    expect(hiddenToday(v, "2026-10-12")).toEqual(["APPROVED_UNPAID:6f1c"]);
  });

  it("ignores missing or garbled values", () => {
    expect(hiddenToday(undefined, "2026-10-12")).toEqual([]);
    expect(hiddenToday("nonsense|@|RENT_STATUS@", "2026-10-12")).toEqual([]);
  });

  it("reads its value from a Cookie header", () => {
    expect(readCookie(`a=1; ${HIDDEN_COOKIE}=${encodeURIComponent("RENT_STATUS@2026-10-12")}; b=2`)).toBe("RENT_STATUS@2026-10-12");
    expect(readCookie("a=1")).toBeNull();
    expect(readCookie(null)).toBeNull();
  });

  it("treats a malformed cookie as nothing hidden instead of throwing", () => {
    expect(readCookie(`${HIDDEN_COOKIE}=%E0%A4`)).toBeNull();
  });
});
