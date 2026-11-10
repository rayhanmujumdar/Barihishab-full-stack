// The outbox worker loop, shared by `pnpm email:worker` (production) and the
// in-process dev worker started from instrumentation.ts (design D1).
// Housekeeping rides along: rate-limit pruning every loop, and hourly a sweep
// of bill uploads never linked to an entry plus the Super Admin request
// reminders (Requests PRD F13; deduplicated, so reruns are safe).
import { sweepUnlinkedUploads } from "@/lib/attachments/attachment-service";
import { pruneRateLimits } from "@/lib/auth/rate-limit";
import { logError, logInfo } from "@/lib/log";
import { queueRequestReminders } from "@/lib/requests/reminders";
import type { Transport } from "./transport";
import { processBatch } from "./worker";

export const POLL_INTERVAL_MS = 5000;
const SWEEP_EVERY_MS = 60 * 60_000;

/**
 * A factory is resolved once per batch, so a changed EMAIL_FROM / RESEND_API_KEY
 * (next dev reloads .env into process.env) applies without a restart.
 */
type TransportSource = Transport | (() => Transport);
/** Resolved before each batch; false = another worker sends for this database, so skip. */
export type WorkerGate = () => Promise<boolean>;
type LoopOptions = { transport: TransportSource; once?: boolean; signal?: AbortSignal; intervalMs?: number; scope?: string; gate?: WorkerGate };

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

export async function runWorkerLoop({ transport, once = false, signal, intervalMs = POLL_INTERVAL_MS, scope = "email-worker", gate }: LoopOptions) {
  let lastSweep = 0;
  async function runBatch(t: Transport) {
    const stats = await processBatch(t);
    await pruneRateLimits();
    if (Date.now() - lastSweep >= SWEEP_EVERY_MS) {
      lastSweep = Date.now();
      const swept = await sweepUnlinkedUploads();
      if (swept) logInfo(scope, `swept ${swept} unlinked upload(s)`);
      const reminders = await queueRequestReminders();
      if (reminders) logInfo(scope, `queued ${reminders} request reminder(s)`);
    }
    if (stats.sent || stats.failed || stats.retried) logInfo(scope, JSON.stringify(stats));
  }

  do {
    try {
      // Not our turn: another dev server holds the lock for this database.
      if (!gate || (await gate())) await runBatch(typeof transport === "function" ? transport() : transport);
    } catch (err) {
      logError(scope, err);
    }
    if (!once && !signal?.aborted) await sleep(intervalMs, signal);
  } while (!once && !signal?.aborted);
}

type DevWorker = { controller: AbortController; done: Promise<void> };
// globalThis survives module re-evaluation on hot reload, so a second
// register() call cannot start a second loop in the same process.
const KEY = Symbol.for("barihisab.devEmailWorker");
const store = globalThis as unknown as Record<symbol, DevWorker | undefined>;

/** Starts the in-process worker once per process; later calls return the running one. */
export type DevWorkerOptions = { transport: TransportSource; intervalMs?: number; gate?: WorkerGate };

export function startDevEmailWorker(opts: DevWorkerOptions): DevWorker {
  const running = store[KEY];
  if (running) return running;
  const controller = new AbortController();
  const worker: DevWorker = {
    controller,
    done: runWorkerLoop({ transport: opts.transport, signal: controller.signal, intervalMs: opts.intervalMs, scope: "email-worker:dev", gate: opts.gate }),
  };
  store[KEY] = worker;
  logInfo("email-worker:dev", "started in-process; reads EMAIL_FROM / RESEND_API_KEY each batch; set EMAIL_WORKER=off to disable");
  return worker;
}

export async function stopDevEmailWorker() {
  const running = store[KEY];
  if (!running) return;
  store[KEY] = undefined;
  running.controller.abort();
  await running.done;
}
