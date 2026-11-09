// Sends queued emails from email_outbox. Run alongside the app:
//   pnpm email:worker          # loop every 5 s
//   pnpm email:worker --once   # one batch, then exit (cron)
import "dotenv/config";
import { pruneRateLimits } from "../lib/auth/rate-limit";
import { processBatch } from "../lib/email/worker";
import { transportFromEnv } from "../lib/email/transport";
import { logError, logInfo } from "../lib/log";
import { prisma } from "../lib/prisma";

const INTERVAL_MS = 5000;

async function main() {
  const once = process.argv.includes("--once");
  const transport = transportFromEnv();
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  logInfo("email-worker", `started (${transport.constructor.name})`);
  do {
    try {
      const stats = await processBatch(transport);
      // Housekeeping piggybacks on the worker loop.
      await pruneRateLimits();
      if (stats.sent || stats.failed || stats.retried) logInfo("email-worker", JSON.stringify(stats));
    } catch (err) {
      logError("email-worker", err);
    }
    if (!once && !stopping) await new Promise((r) => setTimeout(r, INTERVAL_MS));
  } while (!once && !stopping);
  await prisma.$disconnect();
}

void main();
