import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { findUserByIdentifier, hasPassword, verifyUserPassword } from "@/lib/auth/credentials";
import { createUser, DEFAULT_PASSWORD } from "../../helpers/factory";

describe("credentials (better-auth backed)", () => {
  it("stores an Argon2id hash in the better-auth credential account", async () => {
    const user = await createUser();
    const account = await prisma.account.findFirstOrThrow({ where: { userId: user.id } });
    expect(account.providerId).toBe("credential");
    expect(account.password).toMatch(/^\$argon2id\$/);
    expect(await hasPassword(user.id)).toBe(true);
  });

  it("verifies the right password only", async () => {
    const user = await createUser();
    expect((await verifyUserPassword(user.id, DEFAULT_PASSWORD)).valid).toBe(true);
    expect((await verifyUserPassword(user.id, "wrong-password")).valid).toBe(false);
  });

  it("returns invalid for a user without a password or no user at all", async () => {
    const invited = await createUser({ status: "INVITED", password: null });
    expect((await verifyUserPassword(invited.id, DEFAULT_PASSWORD)).valid).toBe(false);
    expect((await verifyUserPassword(null, DEFAULT_PASSWORD)).valid).toBe(false);
  });

  it("finds users by username or email in any letter case", async () => {
    const user = await createUser({ username: "rahim", email: "rahim@example.com" });
    expect((await findUserByIdentifier("RaHiM"))?.id).toBe(user.id);
    expect((await findUserByIdentifier("Rahim@Example.com"))?.id).toBe(user.id);
    expect(await findUserByIdentifier("nobody")).toBeNull();
  });
});
