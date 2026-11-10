import { describe, expect, it } from "vitest";
import { planScale, planSquare } from "./image-canvas";

describe("planScale (bills: keep aspect, cap the long side)", () => {
  it("scales a 4000×3000 photo to 2000×1500", () => {
    expect(planScale(4000, 3000, 2000)).toEqual({ sx: 0, sy: 0, sw: 4000, sh: 3000, width: 2000, height: 1500 });
  });

  it("never upscales", () => {
    expect(planScale(800, 600, 2000)).toEqual({ sx: 0, sy: 0, sw: 800, sh: 600, width: 800, height: 600 });
  });
});

describe("planSquare (profile photos: centre crop to a square)", () => {
  it("crops a landscape 4000×3000 photo to its centre 3000×3000 and scales to 512", () => {
    expect(planSquare(4000, 3000, 512)).toEqual({ sx: 500, sy: 0, sw: 3000, sh: 3000, width: 512, height: 512 });
  });

  it("crops a portrait photo vertically", () => {
    expect(planSquare(1000, 1600, 512)).toEqual({ sx: 0, sy: 300, sw: 1000, sh: 1000, width: 512, height: 512 });
  });

  it("keeps a small photo's own size", () => {
    expect(planSquare(300, 200, 512)).toEqual({ sx: 50, sy: 0, sw: 200, sh: 200, width: 200, height: 200 });
  });
});
