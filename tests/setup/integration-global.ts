// Runs once before the integration suite: rebuilds the test database schema
// from the real migrations so tests exercise the same constraints as prod.
import { execSync } from "node:child_process";
import { Client } from "pg";
import { acquireSuiteLock, assertSafeTestDb, testDatabaseUrl } from "./test-db-url";

export default async function setup() {
  const url = assertSafeTestDb(testDatabaseUrl());
  const release = await acquireSuiteLock(url);
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await client.end();
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: url },
  });
  return release; // teardown: free the DB for the next run
}
