// Email startup checks and the in-process dev worker (fix-email-delivery D1, D3, D9).
// Called from instrumentation.ts on the Node.js runtime, in development only.
import type { EmailEnv } from "./config";
import { createLeaderLock } from "./leader";
import { startDevEmailWorker, type DevWorkerOptions, type WorkerGate } from "./loop";
import { senderProblem } from "./sender";
import { transportFromEnv } from "./transport";

type Boot = Pick<EmailEnv, "NODE_ENV" | "EMAIL_WORKER" | "RESEND_API_KEY" | "EMAIL_FROM">;

/**
 * `next start`, `next build` and vitest all run with NODE_ENV != development.
 * auto (default) needs a provider key: a key-less workspace on the shared dev
 * DB would otherwise "deliver" real rows to its own console and mark them SENT.
 */
export function shouldRunDevWorker(e: Pick<Boot, "NODE_ENV" | "EMAIL_WORKER" | "RESEND_API_KEY">): boolean {
  if (e.NODE_ENV !== "development") return false;
  if (e.EMAIL_WORKER === "on") return true;
  return e.EMAIL_WORKER === "auto" && Boolean(e.RESEND_API_KEY);
}

/**
 * Production already refused to start (assertSendableSender); development gets one loud warning.
 * Not routed through mask(): the text holds no secrets and must show the sandbox address.
 */
export function warnSenderProblem(e: Pick<Boot, "EMAIL_FROM" | "RESEND_API_KEY">): boolean {
  const problem = senderProblem(e.EMAIL_FROM, Boolean(e.RESEND_API_KEY));
  if (problem) console.warn(`\n⚠  [email] ${problem}\n`);
  return problem !== null;
}

/** Single-worker gate: logs when this process starts or stops sending for the database. */
export function leaderGate(connectionString: string, who = "this dev server"): { gate: WorkerGate; release: () => Promise<void> } {
  const lock = createLeaderLock(connectionString);
  let last: boolean | null = null;
  const gate: WorkerGate = async () => {
    const mine = await lock.tryAcquire();
    if (mine !== last) {
      console.info(
        mine
          ? `[email-worker:dev] ${who} sends email for this database`
          : `[email-worker:dev] another process is sending email for this database — ${who} is standing by`,
      );
      last = mine;
    }
    return mine;
  };
  return { gate, release: () => lock.release() };
}

type BootDeps = { start: (opts: DevWorkerOptions) => unknown; gate: () => WorkerGate };

const defaultDeps: BootDeps = {
  start: startDevEmailWorker,
  // The dev server holds the lock for its lifetime; process exit releases it.
  gate: () => leaderGate(process.env.DATABASE_URL ?? "").gate,
};

export function bootEmail(e: Boot, deps: BootDeps = defaultDeps) {
  warnSenderProblem(e);
  if (!shouldRunDevWorker(e)) return;
  // Factory, not an instance: .env edits apply on the next batch (no restart).
  deps.start({ transport: transportFromEnv, gate: deps.gate() });
}
