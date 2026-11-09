import { describe, expect, it } from "vitest";
import { formatMoney, MAX_AMOUNT_PAISA, parseAmount, paisaToInput } from "./money";

describe("parseAmount", () => {
  it.each([
    ["৳১৮,০০০.৫০", 1800050], // IE-02
    ["6,300", 630000],
    ["0.5", 50],
    [" ৳ 1,45,000 ", 14500000],
    ["18000.05", 1800005],
    ["৫", 500],
    ["10000000", MAX_AMOUNT_PAISA],
  ])("parses %j to %i paisa", (input, paisa) => {
    expect(parseAmount(input)).toBe(paisa);
  });

  it.each(["", "  ", "0", "0.00", "-5", "12.345", "abc", "1.2.3", "10000000.01", "99999999999999999999", "1e5", ".5", "5."])(
    "rejects %j",
    (input) => {
      expect(parseAmount(input)).toBeNull();
    },
  );
});

describe("formatMoney", () => {
  it("groups English amounts the lakh way", () => {
    expect(formatMoney("en", 14500000)).toBe("৳1,45,000");
    expect(formatMoney("en", 1000000000)).toBe("৳1,00,00,000");
    expect(formatMoney("en", 99900)).toBe("৳999");
    expect(formatMoney("en", 0)).toBe("৳0");
  });

  it("uses Bangla digits in Bangla", () => {
    expect(formatMoney("bn", 14500000)).toBe("৳১,৪৫,০০০");
  });

  it("shows paisa only when non-zero", () => {
    expect(formatMoney("en", 630050)).toBe("৳6,300.50");
    expect(formatMoney("en", 630005)).toBe("৳6,300.05");
    expect(formatMoney("en", 630000)).toBe("৳6,300");
  });

  it("puts a minus before negative balances", () => {
    expect(formatMoney("en", -230000)).toBe("−৳2,300");
    expect(formatMoney("bn", -50)).toBe("−৳০.৫০");
  });
});

describe("paisaToInput", () => {
  it("prints an editable taka value without grouping", () => {
    expect(paisaToInput(630000)).toBe("6300");
    expect(paisaToInput(630050)).toBe("6300.50");
  });
});
