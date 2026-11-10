// Sends queued emails from email_outbox. Run alongside the app:
//   pnpm email:worker          # loop every 5 s
//   pnpm email:worker --once   # one batch, then exit (cron)
// Housekeeping rides along: rate-limit pruning every loop, and hourly a
// sweep of bill uploads that were never linked to an entry plus the Super
// Admin request reminders (Requests PRD F13; deduplicated, so reruns are safe).
import "dotenv/config";
import { sweepUnlinkedUploads } from "../lib/attachments/attachment-service";
import { pruneRateLimits } from "../lib/auth/rate-limit";
import { processBatch } from "../lib/email/worker";
import { transportFromEnv } from "../lib/email/transport";
import { logError, logInfo } from "../lib/log";
import { prisma } from "../lib/prisma";
import { queueRequestReminders } from "../lib/requests/reminders";

const INTERVAL_MS = 5000;
const SWEEP_EVERY_MS = 60 * 60_000;

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
  let lastSweep = 0;
  do {
    try {
      const stats = await processBatch(transport);
      // Housekeeping piggybacks on the worker loop.
      await pruneRateLimits();
      if (Date.now() - lastSweep >= SWEEP_EVERY_MS) {
        lastSweep = Date.now();
        const swept = await sweepUnlinkedUploads();
        if (swept) logInfo("email-worker", `swept ${swept} unlinked upload(s)`);
        const reminders = await queueRequestReminders();
        if (reminders) logInfo("email-worker", `queued ${reminders} request reminder(s)`);
      }
      if (stats.sent || stats.failed || stats.retried) logInfo("email-worker", JSON.stringify(stats));
    } catch (err) {
      logError("email-worker", err);
    }
    if (!once && !stopping) await new Promise((r) => setTimeout(r, INTERVAL_MS));
  } while (!once && !stopping);
  await prisma.$disconnect();
}

void main();
