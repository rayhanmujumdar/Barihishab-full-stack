import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

async function insertUser(username: string, email: string) {
  return prisma.$executeRaw`
    INSERT INTO users (id, username, display_username, email, name, status, updated_at)
    VALUES (gen_random_uuid(), ${username}, ${username}, ${email}, 'Test', 'ACTIVE', now())`;
}

describe("auth schema constraints", () => {
  it("treats usernames and emails as case-insensitive unique", async () => {
    await insertUser("rahim", "rahim@example.com");
    await expect(insertUser("rahim", "other@example.com")).rejects.toThrow();
    await expect(insertUser("other", "RAHIM@example.com")).rejects.toThrow();
    const found = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM users WHERE email = 'Rahim@Example.COM'`;
    expect(found[0].n).toBe(1);
  });

  it("rejects usernames that break ^[a-z0-9_.]{3,30}$", async () => {
    await expect(insertUser("Ka", "ka@example.com")).rejects.toThrow();
    await expect(insertUser("RAHIM", "r2@example.com")).rejects.toThrow();
    await expect(insertUser("a".repeat(31), "r3@example.com")).rejects.toThrow();
    await expect(insertUser("ok_name.1", "r4@example.com")).resolves.toBe(1);
  });

  it("allows only one global grant of a role per user (NULL property)", async () => {
    await insertUser("karim", "karim@example.com");
    const [{ id }] = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM users WHERE username = 'karim'`;
    const grant = () => prisma.$executeRaw`
      INSERT INTO user_roles (id, user_id, property_id, role) VALUES (gen_random_uuid(), ${id}::uuid, NULL, 'OWNER')`;
    await grant();
    await expect(grant()).rejects.toThrow();
  });

  it("refuses to delete a property that still has scoped role grants (they must not turn global)", async () => {
    await insertUser("scoped", "scoped@example.com");
    const [{ id: userId }] = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM users WHERE username = 'scoped'`;
    const property = await prisma.property.create({ data: { name: "House" } });
    await prisma.userRole.create({ data: { userId, propertyId: property.id, role: "OWNER" } });
    await expect(prisma.property.delete({ where: { id: property.id } })).rejects.toThrow();
    expect(await prisma.userRole.count({ where: { userId, propertyId: property.id } })).toBe(1);
  });

  it("makes audit_logs append-only", async () => {
    await prisma.$executeRaw`
      INSERT INTO audit_logs (action, entity_type, entity_id) VALUES ('test.append', 'test', 'x')`;
    await expect(prisma.$executeRaw`UPDATE audit_logs SET action = 'x' WHERE action = 'test.append'`).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRaw`DELETE FROM audit_logs WHERE action = 'test.append'`).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe(`TRUNCATE audit_logs`)).rejects.toThrow(/append-only/);
  });

  it("deduplicates outbox rows by dedupe_key", async () => {
    const enqueue = () => prisma.$executeRaw`
      INSERT INTO email_outbox (id, to_email, template, locale, payload, dedupe_key)
      VALUES (gen_random_uuid(), 'a@example.com', 'INVITE', 'bn', '{}'::jsonb, 'invite:1')`;
    await enqueue();
    await expect(enqueue()).rejects.toThrow();
  });
});
