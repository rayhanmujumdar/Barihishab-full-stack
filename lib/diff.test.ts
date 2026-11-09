import { describe, expect, it } from "vitest";
import { diffFields } from "./diff";

describe("diffFields", () => {
  it("keeps only changed keys", () => {
    expect(diffFields({ a: 1, b: "x", c: null }, { a: 2, b: "x" })).toEqual({ before: { a: 1 }, after: { a: 2 } });
  });

  it("ignores undefined patch values and reports no change as null", () => {
    expect(diffFields({ a: 1 }, { a: undefined })).toBeNull();
    expect(diffFields({ a: 1, b: null }, { a: 1, b: null })).toBeNull();
  });

  it("treats null vs value as a change", () => {
    expect(diffFields({ v: null as string | null }, { v: "DESCO" })).toEqual({ before: { v: null }, after: { v: "DESCO" } });
  });
});
