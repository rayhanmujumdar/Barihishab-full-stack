// Direct test-DB access for E2E: reads invite/reset links from the email
// outbox (there is no real inbox in tests).
import { Client } from "pg";
import { testDatabaseUrl } from "../tests/setup/test-db-url";

async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export function latestEmailToken(email: string, template: "INVITE" | "RESET"): Promise<string> {
  return withClient(async (c) => {
    const { rows } = await c.query(
      `SELECT payload->>'token' AS token FROM email_outbox WHERE to_email = $1 AND template = $2 ORDER BY created_at DESC LIMIT 1`,
      [email, template],
    );
    if (!rows[0]?.token) throw new Error(`No ${template} email queued for ${email}`);
    return rows[0].token as string;
  });
}

/** Creates (or updates) a period of the single property with the given status. */
export function setPeriodStatus(month: string, status: "OPEN" | "CLOSED"): Promise<void> {
  return withClient(async (c) => {
    await c.query(
      `INSERT INTO periods (id, property_id, month, status, updated_at)
       SELECT gen_random_uuid(), id, $1::date, $2::"PeriodStatus", now() FROM properties ORDER BY created_at LIMIT 1
       ON CONFLICT (property_id, month) DO UPDATE SET status = EXCLUDED.status, updated_at = now()`,
      [`${month}-01`, status],
    );
  });
}
