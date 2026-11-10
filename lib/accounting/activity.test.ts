import { describe, expect, it } from "vitest";
import { mergeActivity } from "./activity";

const item = (id: string, date: string, createdAt = `${date}T06:00:00.000Z`) => ({ id, date, createdAt });

describe("mergeActivity (Home PRD F8, Rule 5)", () => {
  it("merges sources newest first by date and keeps 6", () => {
    const income = [item("i1", "2026-10-10"), item("i2", "2026-10-01")];
    const expense = [item("e1", "2026-10-20"), item("e2", "2026-10-15"), item("e3", "2026-10-14"), item("e4", "2026-10-12")];
    const ledger = [item("a1", "2026-10-12", "2026-10-12T09:00:00.000Z"), item("a2", "2026-09-30")];
    expect(mergeActivity([income, expense, ledger]).map((x) => x.id)).toEqual(["e1", "e2", "e3", "a1", "e4", "i1"]);
  });

  it("breaks same-day ties by creation time, newest first", () => {
    const r = mergeActivity([[item("x", "2026-10-12", "2026-10-12T05:00:00.000Z")], [item("y", "2026-10-12", "2026-10-12T07:00:00.000Z")]]);
    expect(r.map((x) => x.id)).toEqual(["y", "x"]);
    const r2 = mergeActivity([[item("y", "2026-10-12", "2026-10-12T07:00:00.000Z")], [item("x", "2026-10-12", "2026-10-12T05:00:00.000Z")]]);
    expect(r2.map((x) => x.id)).toEqual(["y", "x"]);
  });

  it("is stable when date and creation time are equal", () => {
    expect(mergeActivity([[item("a", "2026-10-12")], [item("b", "2026-10-12")]]).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("honours a custom limit and empty input", () => {
    expect(mergeActivity([[item("a", "2026-10-01"), item("b", "2026-10-02")]], 1).map((x) => x.id)).toEqual(["b"]);
    expect(mergeActivity([])).toEqual([]);
  });
});
