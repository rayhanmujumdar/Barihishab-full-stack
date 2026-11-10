import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { runSeed } from "@/scripts/seed";
import { inspectToken } from "@/lib/auth/token-service";

const env = { SEED_ADMIN_EMAIL: "Admin@Example.com", SEED_ADMIN_USERNAME: "bookkeeper" };

async function counts() {
  return {
    users: await prisma.user.count(),
    tokens: await prisma.authToken.count(),
    outbox: await prisma.emailOutbox.count(),
    properties: await prisma.property.count(),
    roles: await prisma.userRole.count(),
  };
}

describe("seed (BOOT-01/02)", () => {
  it("creates the property and exactly one invited Super Admin with a working invite link", async () => {
    const result = await runSeed(env);
    expect(result.created).toBe(true);
    expect(await counts()).toEqual({ users: 1, tokens: 1, outbox: 1, properties: 1, roles: 1 });

    const admin = await prisma.user.findFirstOrThrow({ include: { roles: true } });
    expect(admin).toMatchObject({ username: "bookkeeper", email: "admin@example.com", status: "INVITED" });
    expect(admin.roles.map((r) => r.role)).toEqual(["SUPER_ADMIN"]);

    expect(result.inviteUrl).toMatch(/\/bn\/invite\/[A-Za-z0-9_-]{43}$/);
    const token = result.inviteUrl!.split("/").pop()!;
    expect((await inspectToken(token, "INVITE")).status).toBe("VALID");
  });

  it("is idempotent: a second run changes nothing", async () => {
    await runSeed(env);
    const before = await counts();
    const again = await runSeed(env);
    expect(again.created).toBe(false);
    expect(await counts()).toEqual(before);
  });

  it("fails clearly when env vars are missing", async () => {
    await expect(runSeed({ SEED_ADMIN_EMAIL: "", SEED_ADMIN_USERNAME: "x" })).rejects.toThrow(/SEED_ADMIN_EMAIL/);
    await expect(runSeed({ SEED_ADMIN_EMAIL: "a@b.co" })).rejects.toThrow(/SEED_ADMIN_USERNAME/);
    await expect(runSeed({ SEED_ADMIN_EMAIL: "a@b.co", SEED_ADMIN_USERNAME: "Bad Name" })).rejects.toThrow(/SEED_ADMIN_USERNAME/);
    expect((await counts()).users).toBe(0);
  });
});

describe("seed — Income & Expenses master data (EXP-02)", () => {
  it("creates every default category exactly once across runs", async () => {
    await runSeed(env);
    await runSeed(env);
    const rows = await prisma.category.findMany();
    expect(rows).toHaveLength(21);
    expect(new Set(rows.map((r) => r.code)).size).toBe(21);
    expect(rows.filter((r) => r.isSystem).map((r) => r.code).sort()).toEqual(["ADJUSTMENT_EXP", "ADJUSTMENT_INC", "ARREAR", "LOAN_WRITTEN_OFF", "OWNER_GRANT", "RENT"]);
    expect(rows.every((r) => r.nameEn && r.nameBn)).toBe(true);
  });

  it("adds the PRD demo units and fund accounts only with SEED_DEMO=true", async () => {
    await runSeed(env);
    expect(await prisma.unit.count()).toBe(0);
    await runSeed({ ...env, SEED_DEMO: "true" });
    await runSeed({ ...env, SEED_DEMO: "true" });
    const units = await prisma.unit.findMany({ orderBy: { sortOrder: "asc" } });
    expect(units.map((u) => [u.name, Number(u.rentPaisa)])).toEqual([
      ["Flat 1A", 1800000],
      ["Flat 1B", 1800000],
      ["Flat 2A", 2000000],
      ["Flat 2B", 2000000],
      ["Flat 3A", 2200000],
      ["Shop G1", 1200000],
    ]);
    expect((await prisma.fundAccount.findMany()).map((f) => f.type).sort()).toEqual(["BANK", "CASH", "WALLET"]);
    expect(units.every((u) => u.defaultFundAccountId)).toBe(true);
  });

  it("adds the Owners PRD §2.2 demo owners and share history only with SEED_DEMO=true", async () => {
    await runSeed(env);
    expect(await prisma.owner.count()).toBe(0);
    await runSeed({ ...env, SEED_DEMO: "true" });
    await runSeed({ ...env, SEED_DEMO: "true" });
    const owners = await prisma.owner.findMany({ orderBy: { sortOrder: "asc" } });
    expect(owners.map((o) => o.displayName)).toEqual(["Nasrin Ahmed", "Rayhan Ahmed", "Tanvir Ahmed", "Farzana Haque", "Sabrina Ahmed"]);
    const admin = await prisma.user.findFirstOrThrow({ where: { username: "bookkeeper" } });
    expect(owners[1].userId).toBe(admin.id);
    const sets = await prisma.shareSet.findMany({ include: { items: true }, orderBy: { effectiveFrom: "asc" } });
    expect(sets.map((s) => [s.effectiveFrom.toISOString().slice(0, 7), s.items.reduce((a, i) => a + i.units, 0)])).toEqual([
      ["2026-01", 100],
      ["2026-06", 100],
    ]);
  });

  it("sets the Distribution PRD §11 5 % reserve rule only with SEED_DEMO=true and never overwrites a saved one", async () => {
    await runSeed(env);
    expect(((await prisma.property.findFirstOrThrow()).settings as { reserve?: unknown }).reserve).toBeUndefined();
    await runSeed({ ...env, SEED_DEMO: "true" });
    const property = await prisma.property.findFirstOrThrow();
    expect((property.settings as { reserve: unknown }).reserve).toEqual({ mode: "PERCENT", percentBp: 500, startingPaisa: 0 });
    await prisma.property.update({ where: { id: property.id }, data: { settings: { reserve: { mode: "OFF", startingPaisa: 0 } } } });
    await runSeed({ ...env, SEED_DEMO: "true" });
    expect(((await prisma.property.findFirstOrThrow()).settings as { reserve: unknown }).reserve).toEqual({ mode: "OFF", startingPaisa: 0 });
  });
});
