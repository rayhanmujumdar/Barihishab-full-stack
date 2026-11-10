import { prisma } from "@/lib/prisma";

// audit_logs is append-only (DB trigger), so it is never truncated; tests
// assert on audit rows by the fresh ids they create instead.
const RESETTABLE_TABLES = [
  "period_reopens",
  "loan_movements",
  "loans",
  "owner_ledger_entries",
  "share_set_items",
  "share_sets",
  "owners",
  "idempotency_keys",
  "attachments",
  "house_transactions",
  "units",
  "fund_accounts",
  "categories",
  "periods",
  "email_outbox",
  "auth_tokens",
  "sessions",
  "ba_sessions",
  "verifications",
  "accounts",
  "user_roles",
  "users",
  "rate_limits",
  "properties",
];

export async function resetDatabase() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${RESETTABLE_TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}
