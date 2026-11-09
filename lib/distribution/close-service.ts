// Close and reopen a month (Distribution PRD F5–F8, F11; DST-02–DST-04).
// Each is one transaction behind a FOR UPDATE lock on the period row, which
// also waits for in-flight writers holding FOR SHARE (design D6).
import { Abort, inTransaction } from "@/lib/api/in-transaction";
import { failWith, type Actor, type Result } from "@/lib/api/result";
import { audit } from "@/lib/audit";
import { now } from "@/lib/clock";
import type { Prisma } from "@/lib/generated/prisma/client";
import { addMonths, monthDate } from "@/lib/periods/month";
import { displayName } from "@/lib/users/dto";
import { buildSnapshot, computeMonth, loadOwners, loadPeriods, type MonthFigures } from "./month-data";

type Tx = Prisma.TransactionClient;

const CLOSE_TIMEOUT = 15_000;

/** Last calendar day of a "YYYY-MM" month (entitlements are dated there, F6.1). */
function lastDay(month: string): Date {
  const first = monthDate(month);
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
}

async function lockPeriodRow(tx: Tx, propertyId: string, month: string) {
  const rows = await tx.$queryRaw<{ id: string; status: "OPEN" | "CLOSED"; reopen_count: number; closed_by: string | null; reserve_override_reason: string | null }[]>`
    SELECT id, status, reopen_count, closed_by, reserve_override_reason FROM periods
    WHERE property_id = ${propertyId}::uuid AND month = ${monthDate(month)}::date FOR UPDATE`;
  if (!rows[0]) throw new Abort(failWith("NOT_FOUND"));
  return rows[0];
}

/**
 * Close and reopen of any month of the property run one at a time: each checks
 * its neighbours (earlier month open? later month closed?), which a row lock on
 * its own month alone can't protect.
 */
async function lockPropertyPeriods(tx: Tx, propertyId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`period_close:${propertyId}`}))`;
}

/** Same key as saveShareSet: a share set for this month can't land mid-close. */
async function lockShareSets(tx: Tx, propertyId: string, month: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`share_set:${propertyId}:${month}`}))`;
}

async function nameOf(tx: Tx, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const u = await tx.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, name: true, username: true } });
  return u ? displayName(u) : null;
}

/** F6.1–F6.2: one ENTITLEMENT per owner with a share, the loan instalments, and loans they pay off become REPAID. */
async function postEntitlementsAndInstalments(
  tx: Tx,
  base: { propertyId: string; periodId: string; entryDate: Date; createdById: string },
  f: MonthFigures,
): Promise<void> {
  const entitlements = f.entitlements.filter((e) => e.amountPaisa > 0);
  if (entitlements.length) {
    await tx.ownerLedgerEntry.createMany({ data: entitlements.map((e) => ({ ...base, ownerId: e.ownerId, type: "ENTITLEMENT" as const, amountPaisa: BigInt(e.amountPaisa) })) });
  }
  if (!f.deductions.length) return;
  await tx.ownerLedgerEntry.createMany({
    data: f.deductions.map((d) => ({ ...base, ownerId: d.ownerId, loanId: d.loanId, type: "LOAN_DEDUCTION" as const, amountPaisa: BigInt(-d.amountPaisa) })),
  });
  const paidOff = f.deductions.filter((d) => d.paysOff).map((d) => d.loanId);
  if (paidOff.length) await tx.loan.updateMany({ where: { id: { in: paidOff } }, data: { status: "REPAID" } });
}

/** F5/F6: post entitlements and loan instalments, snapshot, lock, open the next month. */
export async function closeMonth(propertyId: string, month: string, version: number, actor: Actor): Promise<Result<{ month: string }>> {
  return inTransaction(
    async (tx) => {
      await lockPropertyPeriods(tx, propertyId);
      const row = await lockPeriodRow(tx, propertyId, month);
      if (row.status === "CLOSED") throw new Abort(failWith("PERIOD_ALREADY_CLOSED", undefined, { month, closedBy: await nameOf(tx, row.closed_by) }));
      if (row.reopen_count !== version) throw new Abort(failWith("PERIOD_CHANGED"));
      const earlierOpen = await tx.period.findFirst({ where: { propertyId, status: "OPEN", month: { lt: monthDate(month) } }, orderBy: { month: "asc" } });
      if (earlierOpen) throw new Abort(failWith("PREVIOUS_MONTH_OPEN", undefined, { month: earlierOpen.month.toISOString().slice(0, 7) }));
      await lockShareSets(tx, propertyId, month);
      // Instalments read the outstanding: no other write may move a loan meanwhile.
      await tx.$queryRaw`SELECT id FROM loans WHERE property_id = ${propertyId}::uuid AND status = 'ACTIVE' FOR UPDATE`;

      const periods = await loadPeriods(tx, propertyId);
      const index = periods.findIndex((p) => p.key === month);
      const owners = await loadOwners(tx, propertyId);
      const f = await computeMonth(tx, propertyId, periods, index, owners);
      const sum = f.entitlements.reduce((s, e) => s + e.amountPaisa, 0);
      const shares = f.totalUnits > 0 && f.shares.some((s) => s.units > 0);
      const failed = !shares ? ["SHARES"] : sum !== f.stair.distributablePaisa ? ["BALANCED"] : [];
      if (failed.length) throw new Abort(failWith("CLOSE_BLOCKED", undefined, { failed }));

      const periodId = periods[index].id;
      await postEntitlementsAndInstalments(tx, { propertyId, periodId, entryDate: lastDay(month), createdById: actor.id }, f);
      const snapshot = buildSnapshot(f, row.reserve_override_reason);
      await tx.period.update({ where: { id: periodId }, data: { status: "CLOSED", closedAt: now(), closedById: actor.id, snapshot } });
      await tx.$executeRaw`
        INSERT INTO periods (id, property_id, month, status, updated_at)
        VALUES (gen_random_uuid(), ${propertyId}::uuid, ${monthDate(addMonths(month, 1))}::date, 'OPEN', now())
        ON CONFLICT (property_id, month) DO NOTHING`;
      await audit(tx, {
        actorId: actor.id,
        action: "period.closed",
        entityType: "period",
        entityId: periodId,
        after: {
          month,
          distributablePaisa: snapshot.distributablePaisa,
          deficitCarriedPaisa: snapshot.deficitCarriedPaisa,
          entitlements: snapshot.entitlements,
          loanDeductions: snapshot.loanDeductions,
          reopenCount: row.reopen_count,
        },
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
      return { month };
    },
    { timeout: CLOSE_TIMEOUT },
  );
}

/** F7: the latest closed month only; entitlements and deductions become Void + Reversal. */
export async function reopenMonth(propertyId: string, month: string, reason: string, actor: Actor): Promise<Result<{ month: string }>> {
  return inTransaction(
    async (tx) => {
      await lockPropertyPeriods(tx, propertyId);
      const row = await lockPeriodRow(tx, propertyId, month);
      const laterClosed = await tx.period.count({ where: { propertyId, status: "CLOSED", month: { gt: monthDate(month) } } });
      if (row.status !== "CLOSED" || laterClosed > 0) throw new Abort(failWith("REOPEN_NOT_ALLOWED"));

      const period = await tx.period.update({ where: { id: row.id }, data: { status: "OPEN", reopenCount: { increment: 1 } } });
      await tx.periodReopen.create({
        data: { propertyId, periodId: row.id, reason, reopenedById: actor.id, ...(period.snapshot === null ? {} : { snapshotBefore: period.snapshot }) },
      });

      // Status is OPEN now, so the ledger guard allows the reversals in this month.
      const posted = await tx.ownerLedgerEntry.findMany({ where: { periodId: row.id, type: { in: ["ENTITLEMENT", "LOAN_DEDUCTION"] }, voidedAt: null } });
      const at = now();
      if (posted.length) {
        await tx.ownerLedgerEntry.updateMany({ where: { id: { in: posted.map((e) => e.id) } }, data: { voidedAt: at, voidedById: actor.id, voidReason: reason } });
        await tx.ownerLedgerEntry.createMany({
          data: posted.map((e) => ({
            propertyId,
            ownerId: e.ownerId,
            periodId: row.id,
            type: "REVERSAL" as const,
            amountPaisa: -e.amountPaisa,
            entryDate: e.entryDate,
            loanId: e.loanId,
            reversesId: e.id,
            note: reason,
            createdById: actor.id,
          })),
        });
      }
      const loanIds = posted.flatMap((e) => (e.loanId ? [e.loanId] : []));
      if (loanIds.length) await tx.loan.updateMany({ where: { id: { in: loanIds }, status: "REPAID" }, data: { status: "ACTIVE" } });

      await audit(tx, {
        actorId: actor.id,
        action: "period.reopened",
        entityType: "period",
        entityId: row.id,
        before: { status: "CLOSED", reopenCount: row.reopen_count },
        after: { status: "OPEN", reopenCount: row.reopen_count + 1, reversed: posted.length },
        reason,
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
      return { month };
    },
    { timeout: CLOSE_TIMEOUT },
  );
}
