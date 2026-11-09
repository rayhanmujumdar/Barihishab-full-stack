import { afterEach, describe, expect, it, vi } from "vitest";
import { birthdayField } from "./user-fields";

afterEach(() => vi.useRealTimers());

describe("birthdayField", () => {
  it("accepts today's Dhaka date in the early hours (UTC is still yesterday)", () => {
    // 2026-11-09 02:00 in Dhaka (UTC+6) = 2026-11-08 20:00 UTC.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-08T20:00:00Z"));
    expect(birthdayField.safeParse("2026-11-09").success).toBe(true);
  });

  it("rejects tomorrow's Dhaka date", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-08T20:00:00Z"));
    const r = birthdayField.safeParse("2026-11-10");
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("Birthday can't be in the future");
  });

  it("accepts past dates, null and undefined; rejects malformed dates", () => {
    expect(birthdayField.safeParse("1990-03-20").success).toBe(true);
    expect(birthdayField.safeParse(null).success).toBe(true);
    expect(birthdayField.safeParse(undefined).success).toBe(true);
    expect(birthdayField.safeParse("20-03-1990").success).toBe(false);
  });
});
