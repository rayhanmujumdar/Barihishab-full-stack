// Local-only fixtures for manual browser testing: one ACTIVE login per role,
// all sharing one password, plus owner rows linked to the OWNER logins and a
// share set that gives them units. Run with `pnpm db:seed:test-users`.
// Idempotent: existing test users get their password/status/roles reset;
// owners and shares are only added when missing.
//
// It creates a SUPER_ADMIN, so it refuses to run unless the database is on
// this machine (override: ALLOW_TEST_USERS_SEED=true) and never in production.
// The password is never committed: pin one with TEST_USERS_PASSWORD (≥ 12
// chars) or a random one is generated and printed on each run.
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { audit } from "../lib/audit";
import { setPassword } from "../lib/auth/credentials";
import type { Role } from "../lib/generated/prisma/client";
import { ensureDefaultCategories } from "../lib/master-data/defaults";
import { currentMonthKey, monthDate, monthKey } from "../lib/periods/month";
import { prisma } from "../lib/prisma";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const MIN_PASSWORD = 12;

type TestUser = {
  username: string;
  firstName: string;
  lastName: string;
  roles: Role[];
  locale: "bn" | "en";
  /** Linked Owner row + units in the share set created by this script. */
  owner?: { displayName: string; initials: string; units: number };
};

export const TEST_USERS: readonly TestUser[] = [
  { username: "test.admin", firstName: "Test", lastName: "Admin", roles: ["SUPER_ADMIN"], locale: "en" },
  { username: "test.accountant", firstName: "Test", lastName: "Accountant", roles: ["ACCOUNTANT"], locale: "en" },
  { username: "test.viewer", firstName: "Test", lastName: "Viewer", roles: ["VIEWER"], locale: "en" },
  { username: "test.nasrin", firstName: "Nasrin", lastName: "Ahmed", roles: ["OWNER"], locale: "bn", owner: { displayName: "Nasrin Ahmed", initials: "NA", units: 25 } },
  { username: "test.tanvir", firstName: "Tanvir", lastName: "Ahmed", roles: ["OWNER"], locale: "en", owner: { displayName: "Tanvir Ahmed", initials: "TA", units: 15 } },
  // Owner who also keeps the books — exercises multi-role UI.
  { username: "test.farzana", firstName: "Farzana", lastName: "Haque", roles: ["OWNER", "ACCOUNTANT"], locale: "bn", owner: { displayName: "Farzana Haque", initials: "FH", units: 10 } },
];

export const testEmail = (username: string) => `${username.replace(".", "+")}@example.com`;

export type TestSeedResult = { users: { username: string; email: string; roles: Role[]; created: boolean }[]; shareSetCreated: boolean; password: string };

type Env = Record<string, string | undefined>;

/** Refuses production and any database not on this machine, unless explicitly allowed. */
function assertLocalTarget(env: Env) {
  if (env.NODE_ENV === "production") throw new Error("Refusing to seed test users when NODE_ENV=production");
  if (env.ALLOW_TEST_USERS_SEED === "true") return;
  const url = env.DATABASE_URL ?? process.env.DATABASE_URL ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Refusing to seed test users into a non-local database (host "${host || "unknown"}"). Use a local database, or set ALLOW_TEST_USERS_SEED=true for a disposable one.`);
  }
}

function testPassword(env: Env): string {
  const pinned = env.TEST_USERS_PASSWORD;
  if (pinned === undefined || pinned === "") return randomBytes(12).toString("base64url");
  if (pinned.length < MIN_PASSWORD) throw new Error(`TEST_USERS_PASSWORD must be at least ${MIN_PASSWORD} characters`);
  return pinned;
}

export async function runTestUserSeed(env: Env = process.env): Promise<TestSeedResult> {
  assertLocalTarget(env);
  const password = testPassword(env);

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(4242002)`;
      const property = (await tx.property.findFirst({ orderBy: { createdAt: "asc" } })) ?? (await tx.property.create({ data: { name: "BariHisab House" } }));
      await ensureDefaultCategories(tx, property.id);

      const users: TestSeedResult["users"] = [];
      const ownerIds = new Map<string, number>(); // ownerId → units
      let actorId: string | null = null;

      for (const [i, u] of TEST_USERS.entries()) {
        const email = testEmail(u.username);
        const existing = await tx.user.findUnique({ where: { username: u.username } });
        const data = {
          email,
          name: `${u.firstName} ${u.lastName}`,
          firstName: u.firstName,
          lastName: u.lastName,
          displayUsername: u.username,
          locale: u.locale,
          status: "ACTIVE" as const,
          emailVerified: true,
          failedLoginCount: 0,
          lockedUntil: null,
        };
        const user = existing
          ? await tx.user.update({ where: { id: existing.id }, data })
          : await tx.user.create({ data: { ...data, username: u.username } });

        // Roles: exactly the listed set (global scope, like the first-admin seed).
        await tx.userRole.deleteMany({ where: { userId: user.id } });
        await tx.userRole.createMany({ data: u.roles.map((role) => ({ userId: user.id, role })) });
        await setPassword(tx, user.id, password);
        if (!existing) {
          await audit(tx, { actorId: null, action: "user.created", entityType: "user", entityId: user.id, after: { username: u.username, email, roles: u.roles }, reason: "seed:test-users" });
        }
        actorId ??= u.roles.includes("SUPER_ADMIN") ? user.id : null;
        users.push({ username: u.username, email, roles: u.roles, created: !existing });

        if (u.owner) {
          const owner =
            (await tx.owner.findFirst({ where: { propertyId: property.id, userId: user.id } })) ??
            (await tx.owner.create({
              data: {
                propertyId: property.id,
                userId: user.id,
                displayName: u.owner.displayName,
                initials: u.owner.initials,
                sortOrder: 100 + i,
              },
            }));
          ownerIds.set(owner.id, u.owner.units);
        }
      }

      // Give test owners units: one new share set from the current month that
      // keeps every existing owner's current units and adds the missing ones.
      let shareSetCreated = false;
      const holding = await tx.shareSetItem.findMany({ where: { ownerId: { in: [...ownerIds.keys()] }, shareSet: { replacedAt: null } } });
      if (holding.length === 0) {
        const month = currentMonthKey();
        const latest = await tx.shareSet.findFirst({
          where: { propertyId: property.id, replacedAt: null, effectiveFrom: { lte: monthDate(month) } },
          orderBy: { effectiveFrom: "desc" },
          include: { items: true },
        });
        const units = new Map<string, number>(latest?.items.map((it) => [it.ownerId, it.units]) ?? []);
        for (const [id, n] of ownerIds) units.set(id, n);
        // Same-month re-save replaces the old set (kept for history).
        if (latest && monthKey(latest.effectiveFrom) === month) {
          await tx.shareSet.update({ where: { id: latest.id }, data: { replacedAt: new Date() } });
        }
        await tx.shareSet.create({
          data: {
            propertyId: property.id,
            effectiveFrom: monthDate(month),
            reason: "Test owners added for manual testing (seed:test-users)",
            createdById: actorId!,
            items: { create: [...units].map(([ownerId, n]) => ({ ownerId, units: n })) },
          },
        });
        shareSetCreated = true;
      }

      return { users, shareSetCreated, password };
    },
    { timeout: 60_000 },
  );
}

async function main() {
  try {
    const result = await runTestUserSeed();
    console.log("✔ Test users ready (all ACTIVE). Sign in with username or email:");
    console.table(result.users.map((u) => ({ username: u.username, email: u.email, roles: u.roles.join(" + "), new: u.created })));
    console.log(`Password for all of them: ${result.password}${process.env.TEST_USERS_PASSWORD ? "" : "  (random — set TEST_USERS_PASSWORD to keep one)"}`);
    console.log(result.shareSetCreated ? "✔ Share set created from this month for the test owners." : "✔ Test owners already hold shares — share sets untouched.");
  } catch (err) {
    console.error(`✖ Test-user seed failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/seed-test-users.ts")) {
  void main();
}
