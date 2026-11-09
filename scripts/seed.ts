// Bootstraps the first Super Admin (BOOT-01/02). Run with `pnpm db:seed`.
// Idempotent: if any user already holds SUPER_ADMIN it does nothing.
import "dotenv/config";
import { audit } from "../lib/audit";
import { USERNAME_PATTERN } from "../lib/auth/better-auth";
import { INVITE_TTL_MS, issueToken } from "../lib/auth/token-service";
import { enqueueEmail } from "../lib/email/outbox";
import { ensureDefaultCategories, ensureDemoData } from "../lib/master-data/defaults";
import { ensureDemoReserve } from "../lib/distribution/reserve-service";
import { ensureDemoOwners } from "../lib/owners/demo";
import { prisma } from "../lib/prisma";

export type SeedResult = { created: boolean; inviteUrl?: string };

export async function runSeed(env: Record<string, string | undefined> = process.env): Promise<SeedResult> {
  const email = env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const username = env.SEED_ADMIN_USERNAME?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("SEED_ADMIN_EMAIL must be set to a valid email address");
  }
  if (!username || !USERNAME_PATTERN.test(username)) {
    throw new Error("SEED_ADMIN_USERNAME must be set: 3–30 chars of a-z 0-9 _ . (lowercase)");
  }
  const appUrl = (env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

  return prisma.$transaction(
    async (tx) => {
      // Serialise concurrent seeds.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(4242001)`;

      const property = (await tx.property.findFirst({ orderBy: { createdAt: "asc" } })) ?? (await tx.property.create({ data: { name: "BariHisab House" } }));
      await ensureDefaultCategories(tx, property.id);
      if (env.SEED_DEMO === "true") {
        await ensureDemoData(tx, property.id, new Date(`${new Date().toISOString().slice(0, 7)}-01T00:00:00Z`));
        await ensureDemoReserve(tx, property.id);
      }
      const existing = await tx.userRole.findFirst({ where: { role: "SUPER_ADMIN" } });
      if (existing) {
        if (env.SEED_DEMO === "true") await ensureDemoOwners(tx, property.id, existing.userId);
        return { created: false };
      }

      const user = await tx.user.create({
        data: {
          username,
          displayUsername: username,
          email,
          name: username,
          status: "INVITED",
          locale: "bn",
          roles: { create: { role: "SUPER_ADMIN" } },
        },
      });
      const token = await issueToken(tx, { userId: user.id, type: "INVITE", createdById: null });
      await enqueueEmail(tx, {
        template: "INVITE",
        toUserId: user.id,
        toEmail: email,
        locale: "bn",
        payload: {
          token,
          firstName: username,
          invitedBy: "BariHisab",
          expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
        },
        dedupeKey: `invite:${user.id}:seed`,
      });
      await audit(tx, { actorId: null, action: "user.created", entityType: "user", entityId: user.id, after: { username, email, roles: ["SUPER_ADMIN"] }, reason: "seed" });
      await audit(tx, { actorId: null, action: "auth.invite.sent", entityType: "user", entityId: user.id, reason: "seed" });
      if (env.SEED_DEMO === "true") await ensureDemoOwners(tx, property.id, user.id);
      return { created: true, inviteUrl: `${appUrl}/bn/invite/${token}` };
    },
    { timeout: 20_000 },
  );
}

async function main() {
  try {
    const result = await runSeed();
    if (result.created) {
      console.log("✔ First Super Admin created (status INVITED).");
      console.log("  One-time invite link (valid 72 h) — open it to set the password:");
      console.log(`  ${result.inviteUrl}`);
    } else {
      console.log("✔ A Super Admin already exists — default categories checked (and demo units/funds/owners if SEED_DEMO=true).");
    }
  } catch (err) {
    console.error(`✖ Seed failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/seed.ts")) {
  void main();
}
