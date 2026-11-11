import { describe, expect, it } from "vitest";
import { ExpensesQuerySchema, FundsQuerySchema, monthsBetween, monthSpan, MonthlyQuerySchema, queryObject, YearlyQuerySchema } from "./params";

const A = "6f1c1c1e-1b1a-4c3c-9e1e-111111111111";
const B = "6f1c1c1e-1b1a-4c3c-9e1e-222222222222";

describe("report query params", () => {
  it("accepts month keys and csv format, rejects bad months", () => {
    expect(MonthlyQuerySchema.safeParse({ month: "2026-10", format: "csv" }).success).toBe(true);
    expect(MonthlyQuerySchema.safeParse({ month: "2026-13" }).success).toBe(false);
    expect(MonthlyQuerySchema.safeParse({ format: "pdf" }).success).toBe(false);
  });

  it("limits years to 2000–2100", () => {
    expect(YearlyQuerySchema.safeParse({ year: "2026" }).success).toBe(true);
    expect(YearlyQuerySchema.safeParse({ year: "2100" }).success).toBe(true);
    expect(YearlyQuerySchema.safeParse({ year: "1999" }).success).toBe(false);
    expect(YearlyQuerySchema.safeParse({ year: "26" }).success).toBe(false);
  });

  it("allows expense ranges up to 36 months, in order", () => {
    expect(monthSpan("2026-01", "2026-12")).toBe(12);
    expect(monthSpan("2024-01", "2026-12")).toBe(36);
    expect(ExpensesQuerySchema.safeParse({ from: "2024-01", to: "2026-12" }).success).toBe(true);
    expect(ExpensesQuerySchema.safeParse({ from: "2023-12", to: "2026-12" }).success).toBe(false);
    expect(ExpensesQuerySchema.safeParse({ from: "2026-05", to: "2026-04" }).success).toBe(false);
    expect(ExpensesQuerySchema.parse({ from: "2026-01", to: "2026-01" }).categoryId).toEqual([]);
    expect(ExpensesQuerySchema.safeParse({ from: "2026-01", to: "2026-01", categoryId: ["nope"] }).success).toBe(false);
  });

  it("lists the months of a range", () => {
    expect(monthsBetween("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthsBetween("2026-02", "2026-01")).toEqual([]);
  });

  it("needs exactly one of month or year for funds", () => {
    expect(FundsQuerySchema.safeParse({ month: "2026-10" }).success).toBe(true);
    expect(FundsQuerySchema.safeParse({ year: "2026" }).success).toBe(true);
    expect(FundsQuerySchema.safeParse({}).success).toBe(false);
    expect(FundsQuerySchema.safeParse({ month: "2026-10", year: "2026" }).success).toBe(false);
  });

  it("collects repeated and comma-separated multi keys", () => {
    expect(queryObject(`http://x/r?from=2026-01&categoryId=${A}&categoryId=${B},`, ["categoryId"])).toEqual({ from: "2026-01", categoryId: [A, B] });
    expect(queryObject("http://x/r?from=2026-01", ["categoryId"])).toEqual({ from: "2026-01" });
  });
});
