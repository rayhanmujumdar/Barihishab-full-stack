// Monthly periods (Income & Expenses PRD §3.3, PER-01, LCK-01). Close/Reopen
// belongs to Distribution; this module opens months and guards writes.
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { currentMonthKey, monthDate, monthKey } from "./month";

type Tx = Prisma.TransactionClient;

export type PeriodDto = { id: string; month: string; status: "OPEN" | "CLOSED" };

const toDto = (p: { id: string; month: Date; status: "OPEN" | "CLOSED" }): PeriodDto => ({ id: p.id, month: monthKey(p.month), status: p.status });

/** Opens the current Asia/Dhaka month if missing; race-safe, never changes status. */
export async function ensureCurrentPeriod(propertyId: string): Promise<void> {
  const month = monthDate(currentMonthKey());
  await prisma.$executeRaw`
    INSERT INTO periods (id, property_id, month, status, updated_at)
    VALUES (gen_random_uuid(), ${propertyId}::uuid, ${month}::date, 'OPEN', now())
    ON CONFLICT (property_id, month) DO NOTHING`;
}

export async function listPeriods(propertyId: string): Promise<{ items: PeriodDto[]; latestOpen: string | null }> {
  const rows = await prisma.period.findMany({ where: { propertyId }, orderBy: { month: "desc" } });
  const items = rows.map(toDto);
  return { items, latestOpen: items.find((p) => p.status === "OPEN")?.month ?? null };
}

export async function findPeriod(db: Tx | typeof prisma, propertyId: string, key: string): Promise<PeriodDto | null> {
  const p = await db.period.findUnique({ where: { propertyId_month: { propertyId, month: monthDate(key) } } });
  return p ? toDto(p) : null;
}

/**
 * Share-locks a period row for the rest of the transaction so a concurrent
 * Close can't interleave with a write (§13 Concurrency).
 */
export async function lockPeriod(tx: Tx, periodId: string): Promise<PeriodDto | null> {
  const rows = await tx.$queryRaw<{ id: string; month: Date; status: "OPEN" | "CLOSED" }[]>`
    SELECT id, month, status FROM periods WHERE id = ${periodId}::uuid FOR SHARE`;
  return rows[0] ? toDto(rows[0]) : null;
}

/** The DB trigger's backstop error (only reachable if the lock was skipped). */
export function isPeriodClosedError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("PERIOD_CLOSED");
}
