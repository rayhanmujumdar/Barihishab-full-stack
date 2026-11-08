import { isDiagnosticsEnabled } from "@/lib/api/constants";
import { fail, ok } from "@/lib/api/response";
import { withTimeout } from "@/lib/api/timeout";
import { prisma } from "@/lib/prisma";
import type { DbCheckReport, DbCheckStep } from "./schema";

const STEP_TIMEOUT_MS = 3000;
const NO_STORE = { "Cache-Control": "no-store" };

// POST, not GET: this writes to the database, and POST handlers are never
// prerendered or cached, so no connection() call is needed.
export async function POST() {
  if (!isDiagnosticsEnabled()) {
    return fail({ status: 404, code: "NOT_FOUND", message: "Not found" });
  }

  const totalStart = performance.now();
  const latencyMs: Partial<DbCheckReport["latencyMs"]> = {};
  let step: DbCheckStep = "connect";
  let rowId: number | undefined;

  // Runs one step under a deadline and records how long it took.
  async function run<T>(name: DbCheckStep, fn: () => Promise<T>): Promise<T> {
    step = name;
    const started = performance.now();
    const result = await withTimeout(fn(), STEP_TIMEOUT_MS);
    latencyMs[name] = Math.round(performance.now() - started);
    return result;
  }

  try {
    const [{ version }] = await run("connect", () =>
      prisma.$queryRaw<{ version: string }[]>`SELECT version()`,
    );

    const marker = `api health/db ${new Date().toISOString()}`;
    const created = await run("write", () =>
      prisma.connectionTest.create({ data: { message: marker } }),
    );
    rowId = created.id;

    const found = await run("read", () =>
      prisma.connectionTest.findUnique({ where: { id: created.id } }),
    );
    if (found?.message !== marker) throw new Error("Read-back mismatch");

    await run("delete", () =>
      prisma.connectionTest.delete({ where: { id: created.id } }),
    );
    rowId = undefined;

    const [migrations] = await run("migrations", () =>
      prisma.$queryRaw<{ applied: number; latest: string | null }[]>`
        SELECT count(*)::int AS applied, max(migration_name) AS latest
        FROM _prisma_migrations
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );

    const report: DbCheckReport = {
      status: "ok",
      server: version.split(" on ")[0].split(",")[0],
      roundTrip: { rowId: created.id, wrote: true, readBack: true, deleted: true },
      migrations,
      latencyMs: {
        ...(latencyMs as Omit<DbCheckReport["latencyMs"], "total">),
        total: Math.round(performance.now() - totalStart),
      },
      timestamp: new Date().toISOString(),
    };
    return ok(report, { headers: NO_STORE });
  } catch (err) {
    // Log the real cause server-side; clients only learn which step failed.
    console.error(`[health/db] failed at step "${step}":`, err);
    return fail(
      {
        status: 503,
        code: "DATABASE_CHECK_FAILED",
        message: `Database check failed at step "${step}"`,
        details: { failedStep: step, latencyMs },
      },
      { headers: NO_STORE },
    );
  } finally {
    // Don't leave the test row behind if read/compare failed after the write.
    if (rowId !== undefined) {
      await prisma.connectionTest
        .delete({ where: { id: rowId } })
        .catch((e: unknown) => console.error("[health/db] cleanup failed:", e));
    }
  }
}
