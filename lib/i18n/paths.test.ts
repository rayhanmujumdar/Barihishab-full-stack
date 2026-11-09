import { describe, expect, it } from "vitest";
import { localeFromPath, localePath, stripLocale } from "./paths";

describe("locale paths", () => {
  it("prefixes paths with the locale", () => {
    expect(localePath("en", "/admin/users")).toBe("/en/admin/users");
    expect(localePath("bn", "/")).toBe("/bn");
    expect(localePath("en", "/bn/me?tab=1")).toBe("/en/me?tab=1");
  });

  it("strips and reads the locale segment", () => {
    expect(stripLocale("/en/admin/users")).toBe("/admin/users");
    expect(stripLocale("/bn")).toBe("/");
    expect(stripLocale("/english")).toBe("/english");
    expect(localeFromPath("/en/me")).toBe("en");
    expect(localeFromPath("/bn")).toBe("bn");
    expect(localeFromPath("/fr/me")).toBeNull();
    expect(localeFromPath(null)).toBeNull();
  });
});
