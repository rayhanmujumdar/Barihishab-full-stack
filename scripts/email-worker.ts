// Sends queued emails from email_outbox. Run alongside the app in production:
//   pnpm email:worker          # loop every 5 s
//   pnpm email:worker --once   # one batch, then exit (cron)
// In development `pnpm dev` already runs this loop in-process (instrumentation.ts).
// The loop and its housekeeping live in lib/email/loop.ts.
import "dotenv/config";
import { leaderGate, shouldRunDevWorker, warnSenderProblem } from "../lib/email/boot";
import { runWorkerLoop } from "../lib/email/loop";
import { senderAddress } from "../lib/email/sender";
import { emailEnv } from "../lib/email/config";
import { transportFromEnv } from "../lib/email/transport";
import { logInfo } from "../lib/log";
import { prisma } from "../lib/prisma";

async function main() {
  // Only the email settings are validated, so a worker container needs no auth
  // secrets. Same sender rule as the app: production refuses, development warns.
  const e = emailEnv(process.env);
  warnSenderProblem(e);
  const once = process.argv.includes("--once");
  const transport = transportFromEnv();
  const controller = new AbortController();
  process.on("SIGINT", () => controller.abort());
  process.on("SIGTERM", () => controller.abort());

  const senderDomain = senderAddress(e.EMAIL_FROM).split("@").pop();
  logInfo("email-worker", `started (${transport.constructor.name}, sender domain ${senderDomain}); restart after editing .env`);
  if (e.NODE_ENV === "development" && shouldRunDevWorker(e)) {
    console.warn("[email-worker] `pnpm dev` already runs this worker in-process — you don't need this one in development.");
  }
  // In development, compete for the same single-worker lock as the dev servers
  // (shared dev DB, per-workspace .env). Production replicas share work via SKIP LOCKED.
  const leader = e.NODE_ENV === "development" ? leaderGate(process.env.DATABASE_URL ?? "", "this `pnpm email:worker`") : null;
  await runWorkerLoop({ transport, once, signal: controller.signal, gate: leader?.gate });
  await leader?.release();
  await prisma.$disconnect();
}

void main();
