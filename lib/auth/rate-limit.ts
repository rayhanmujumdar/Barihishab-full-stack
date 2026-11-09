// Fixed-window counters in Postgres (design D5). One atomic upsert per hit,
// so concurrent requests can't slip past the limit.
import { prisma } from "@/lib/prisma";
import { now } from "@/lib/clock";

export type Limit = { name: string; max: number; windowMs: number };

export const LIMITS = {
  authPerIp: { name: "ip:auth", max: 10, windowMs: 60_000 },
  loginPerIdentifier: { name: "id:login", max: 5, windowMs: 60_000 },
  resetEmailPerAccount: { name: "acct:reset-email", max: 3, windowMs: 60 * 60_000 },
} as const satisfies Record<string, Limit>;

/** Drops counters whose window ended over a day ago (keys are attacker-chosen, so they must not pile up). */
export async function pruneRateLimits(): Promise<number> {
  return prisma.$executeRaw`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`;
}

export type HitResult = { allowed: boolean; retryAfterSeconds: number };

export async function hit(limit: Limit, subject: string): Promise<HitResult> {
  const key = `${limit.name}:${subject.trim().toLowerCase()}`;
  const t = now();
  const windowFloor = new Date(t.getTime() - limit.windowMs);
  const rows = await prisma.$queryRaw<{ count: number; window_start: Date }[]>`
    INSERT INTO rate_limits (key, count, window_start)
    VALUES (${key}, 1, ${t})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start <= ${windowFloor} THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start <= ${windowFloor} THEN ${t} ELSE rate_limits.window_start END
    RETURNING count, window_start`;
  const { count, window_start } = rows[0];
  if (count <= limit.max) return { allowed: true, retryAfterSeconds: 0 };
  const retryMs = window_start.getTime() + limit.windowMs - t.getTime();
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)) };
}
