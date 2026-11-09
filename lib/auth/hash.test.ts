import { describe, expect, it } from "vitest";
import { hashPassword, needsRehash, verifyPassword } from "./hash";

describe("argon2id password hashing", () => {
  it("produces an Argon2id encoded hash with PRD parameters", async () => {
    const hash = await hashPassword("Gh7!tree-river");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(hash).not.toContain("Gh7!tree-river");
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same-password-1")).not.toBe(await hashPassword("same-password-1"));
  });

  it("verifies the right password and rejects the wrong one", async () => {
    const hash = await hashPassword("Gh7!tree-river");
    expect(await verifyPassword(hash, "Gh7!tree-river")).toBe(true);
    expect(await verifyPassword(hash, "gh7!tree-river")).toBe(false);
  });

  it("returns false (never throws) for a malformed hash", async () => {
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
  });

  it("flags hashes with outdated parameters for rehash", async () => {
    const current = await hashPassword("Gh7!tree-river");
    expect(needsRehash(current)).toBe(false);
    expect(needsRehash("$argon2id$v=19$m=4096,t=3,p=1$c2FsdHNhbHQ$aGFzaA")).toBe(true);
    expect(needsRehash("$2b$12$abcdefghijklmnopqrstuv")).toBe(true);
  });
});
