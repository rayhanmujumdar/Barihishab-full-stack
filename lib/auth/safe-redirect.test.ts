import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-redirect";

describe("safeNext", () => {
  it.each([
    ["/admin/users", "/admin/users"],
    ["/me?tab=security", "/me?tab=security"],
  ])("keeps internal path %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });

  it.each([
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    "javascript:alert(1)",
    "admin",
    "",
    null,
    undefined,
    "/%2F%2Fevil.example",
    "/..//evil.example",
    "/.//evil.example",
    "/%2e%2e//evil.example",
  ])("falls back to / for %s", (input) => {
    expect(safeNext(input as string | null | undefined)).toBe("/");
  });

  it("never redirects back into auth pages", () => {
    expect(safeNext("/login")).toBe("/");
  });
});

describe("safeLocalNext", () => {
  it("keeps a localized path and prefixes a bare one", async () => {
    const { safeLocalNext } = await import("./safe-redirect");
    expect(safeLocalNext("/en/admin/users", "en")).toBe("/en/admin/users");
    // The current language wins (user toggled on the login page).
    expect(safeLocalNext("/bn/admin/users", "en")).toBe("/en/admin/users");
    expect(safeLocalNext("/admin/users", "en")).toBe("/en/admin/users");
    expect(safeLocalNext("//evil.example", "bn")).toBe("/bn");
    expect(safeLocalNext("/en/login", "bn")).toBe("/bn");
  });
});
