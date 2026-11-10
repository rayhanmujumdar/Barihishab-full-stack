// One sending dev worker per database (code-review H1). Conductor workspaces
// share the dev DB but each has its own .env; without this, whichever process
// claims a row first decides how it is sent — a stale or key-less config can
// fail it or "deliver" it to a console. A session-level Postgres advisory lock
// on a dedicated connection: released automatically when that process exits.
import { createHash } from "node:crypto";
import { Client } from "pg";

export type LeaderLock = { tryAcquire(): Promise<boolean>; release(): Promise<void> };

/** Stable signed 64-bit key from a name (advisory locks are per database). */
function lockKey(name: string): string {
  return createHash("sha256").update(name).digest().readBigInt64BE(0).toString();
}

export function createLeaderLock(connectionString: string, name = "barihisab.email.dev-worker"): LeaderLock {
  const key = lockKey(name);
  let client: Client | null = null;
  let held = false;

  async function connect(): Promise<Client> {
    if (client) return client;
    const c = new Client({ connectionString });
    // A dropped connection loses the lock; reconnect and re-compete next time.
    c.on("error", () => {
      held = false;
      client = null;
    });
    await c.connect();
    client = c;
    return c;
  }

  return {
    async tryAcquire() {
      try {
        const c = await connect();
        if (held) return true;
        const res = await c.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1::bigint) AS ok", [key]);
        held = res.rows[0]?.ok === true;
        return held;
      } catch {
        held = false;
        client = null;
        return false;
      }
    },
    async release() {
      const c = client;
      client = null;
      held = false;
      if (c) await c.end().catch(() => {});
    },
  };
}
