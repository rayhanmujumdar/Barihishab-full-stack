// The integration/E2E database: DATABASE_URL_TEST, or DATABASE_URL with `_test`
// appended to the database name. Never the dev database.
import { Client } from "pg";

export function testDatabaseUrl(): string | undefined {
  return (
    process.env.DATABASE_URL_TEST ??
    process.env.DATABASE_URL?.replace(/\/([^/?]+)(\?|$)/, "/$1_test$2")
  );
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Refuses anything but a local `*_test` database: the suites DROP its schema. */
export function assertSafeTestDb(url: string | undefined): string {
  if (!url) throw new Error("No test database URL (set DATABASE_URL_TEST)");
  const u = new URL(url);
  if (!u.pathname.endsWith("_test")) {
    throw new Error(`Refusing to reset a non-test database: ${u.pathname}`);
  }
  if (!LOCAL_HOSTS.has(u.hostname) && process.env.TEST_DB_ALLOW_REMOTE !== "true") {
    throw new Error(`Refusing to reset a non-local test database host: ${u.hostname} (set TEST_DB_ALLOW_REMOTE=true to override)`);
  }
  return url;
}

// Integration and E2E share the test DB and both drop its schema, so a
// session-level advisory lock makes concurrent runs (another suite, another
// worktree) wait for each other instead of corrupting each other.
const SUITE_LOCK = 4242099;

export async function acquireSuiteLock(url: string): Promise<() => Promise<void>> {
  const client = new Client({ connectionString: url });
  await client.connect();
  const { rows } = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [SUITE_LOCK]);
  if (!rows[0].ok) {
    console.warn("⏳ Another test run is using the test database — waiting for it to finish…");
    await client.query("SELECT pg_advisory_lock($1)", [SUITE_LOCK]);
  }
  return async () => {
    await client.query("SELECT pg_advisory_unlock($1)", [SUITE_LOCK]).catch(() => {});
    await client.end();
  };
}
