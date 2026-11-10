import { describe, expect, it } from "vitest";
import { failWith, isFail } from "./result";

describe("isFail", () => {
  it("is true only for a { ok: false } failure", () => {
    expect(isFail(failWith("NOT_FOUND"))).toBe(true);
    for (const v of [null, undefined, [], [{ ok: false }], { ok: true }, { id: "x" }, 0, "fail"]) expect(isFail(v), JSON.stringify(v)).toBe(false);
  });
});
