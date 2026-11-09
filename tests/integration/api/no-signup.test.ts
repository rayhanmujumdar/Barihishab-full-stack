import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { auth } from "@/lib/auth/better-auth";
import { prisma } from "@/lib/prisma";

describe("no public sign-up (INV-01)", () => {
  it("does not mount the better-auth HTTP handler anywhere", () => {
    for (const dir of ["app/api/auth", "app/api/[...all]", "app/api/v1/auth/[...all]"]) {
      expect(existsSync(path.join(process.cwd(), dir)), dir).toBe(false);
    }
  });

  it("better-auth refuses email sign-up even when called server-side", async () => {
    await expect(
      auth.api.signUpEmail({ body: { email: "intruder@example.com", password: "Gh7!tree-river", name: "X", username: "intruder" } }),
    ).rejects.toThrow();
    expect(await prisma.user.count({ where: { email: "intruder@example.com" } })).toBe(0);
  });
});
