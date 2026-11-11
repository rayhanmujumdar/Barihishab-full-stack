import { describe, expect, it } from "vitest";
import { many, monthParam, one, yearParam } from "./page-params";
import { viewerName } from "./print-viewer";

describe("report page params (reports-ui: bad values fall back)", () => {
  it("reads single, repeated and comma-separated values", () => {
    expect(one(["a", "b"])).toBe("a");
    expect(one(undefined)).toBeUndefined();
    expect(many(["x,y", "z"])).toEqual(["x", "y", "z"]);
    expect(many("x")).toEqual(["x"]);
    expect(many(undefined)).toEqual([]);
  });

  it("accepts only valid months and years", () => {
    expect(monthParam({ month: "2026-10" })).toBe("2026-10");
    expect(monthParam({ month: "2026-13" })).toBeNull();
    expect(monthParam({ from: "2026-01" }, "from")).toBe("2026-01");
    expect(yearParam({ year: "2026" })).toBe(2026);
    expect(yearParam({ year: "26" })).toBeNull();
    expect(yearParam({})).toBeNull();
  });

  it("names who generated a printout", () => {
    expect(viewerName({ firstName: "Rayhan", lastName: "Ahmed", username: "rayhan" })).toBe("Rayhan Ahmed");
    expect(viewerName({ firstName: null, lastName: null, username: "bookkeeper" })).toBe("bookkeeper");
  });
});
