// Fresh _test database + first Super Admin, then hands the seed invite URL to the specs.
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { Client } from "pg";
import { acquireSuiteLock, assertSafeTestDb, testDatabaseUrl } from "../tests/setup/test-db-url";
import { E2E_STORAGE } from "../playwright.config";

export const STATE_FILE = ".context/e2e-state.json";
export const ADMIN = { username: "bookkeeper", email: "admin@example.com", password: "Gh7!tree-river" };

export default async function globalSetup() {
  const url = assertSafeTestDb(testDatabaseUrl());
  const release = await acquireSuiteLock(url);
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await client.end();
  const env = { ...process.env, DATABASE_URL: url };
  execSync("pnpm exec prisma migrate deploy", { stdio: "pipe", env });
  const out = execSync("pnpm exec tsx scripts/seed.ts", {
    env: { ...env, SEED_ADMIN_EMAIL: ADMIN.email, SEED_ADMIN_USERNAME: ADMIN.username, APP_URL: `http://localhost:${process.env.E2E_PORT ?? 3100}` },
  }).toString();
  // Private test bucket + CORS for the test origin (fails fast if `pnpm db:up` wasn't run).
  execSync("pnpm exec tsx scripts/storage-init.ts", { stdio: "pipe", env: { ...process.env, ...E2E_STORAGE } });
  const inviteUrl = out.match(/https?:\/\/\S+\/invite\/\S+/)?.[0];
  if (!inviteUrl) throw new Error(`Seed did not print an invite URL:\n${out}`);
  mkdirSync(".context", { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify({ inviteUrl }));
  return release; // teardown: free the DB for the next run
}
