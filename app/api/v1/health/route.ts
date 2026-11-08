import { connection } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { withTimeout } from "@/lib/api/timeout";
import { prisma } from "@/lib/prisma";
import type { HealthReport } from "./schema";

const DB_TIMEOUT_MS = 2000;
const NO_STORE = { "Cache-Control": "no-store" };

async function checkDatabase(): Promise<HealthReport["checks"]["database"]> {
  const started = performance.now();
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, DB_TIMEOUT_MS);
    return { status: "up", latencyMs: Math.round(performance.now() - started) };
  } catch (err) {
    // Log the real cause server-side; never echo DB errors to clients.
    console.error("[health] database check failed:", err);
    return { status: "down", latencyMs: Math.round(performance.now() - started) };
  }
}

export async function GET() {
  // Health must run on every request — never prerendered at build time.
  await connection();

  const database = await checkDatabase();
  const healthy = database.status === "up";

  const report: HealthReport = {
    status: healthy ? "ok" : "degraded",
    apiVersion: "v1",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: { database },
  };

  if (healthy) return ok(report, { headers: NO_STORE });

  return fail(
    {
      status: 503,
      code: "SERVICE_UNAVAILABLE",
      message: "One or more dependencies are down",
      details: report,
    },
    { headers: NO_STORE },
  );
}
