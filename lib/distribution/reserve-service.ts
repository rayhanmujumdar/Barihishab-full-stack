// Reserve holdback (Distribution PRD F9, G3, §7.4; SET-02). The rule lives in
// properties.settings.reserve (PRD §9.3); the balance is computed on read.
import { z } from "zod";
import type { ReserveRule } from "@/lib/accounting/distribution";
import { Abort, inTransaction } from "@/lib/api/in-transaction";
import { failWith, type Actor, type Result } from "@/lib/api/result";
import { audit } from "@/lib/audit";
import type { Prisma } from "@/lib/generated/prisma/client";
import { findPeriod } from "@/lib/periods/period-service";
import { prisma } from "@/lib/prisma";
import { readSnapshot, ReserveRuleSchema } from "./snapshot";

type Db = Prisma.TransactionClient | typeof prisma;

export const ReserveSettingsSchema = z.intersection(ReserveRuleSchema, z.object({ startingPaisa: z.number().int().min(0).max(1_000_000_000) }));
export type ReserveSettings = ReserveRule & { startingPaisa: number };

const OFF: ReserveSettings = { mode: "OFF", startingPaisa: 0 };

/** The saved rule, or Off with no starting reserve. */
export function readReserveSettings(settings: unknown): ReserveSettings {
  const raw = (settings as { reserve?: unknown } | null)?.reserve;
  const r = ReserveSettingsSchema.safeParse(raw);
  return r.success ? r.data : OFF;
}

/** Just the rule part (what goes into a snapshot). */
export function ruleOf(s: ReserveSettings): ReserveRule {
  if (s.mode === "PERCENT") return { mode: "PERCENT", percentBp: s.percentBp };
  if (s.mode === "FIXED") return { mode: "FIXED", fixedPaisa: s.fixedPaisa };
  return { mode: "OFF" };
}

export async function loadReserveSettings(db: Db, propertyId: string): Promise<ReserveSettings> {
  const p = await db.property.findUniqueOrThrow({ where: { id: propertyId }, select: { settings: true } });
  return readReserveSettings(p.settings);
}

/** Starting reserve + Σ reserve kept in closed months − Σ expenses paid from the Reserve (§7.4). */
export async function reserveBalance(db: Db, propertyId: string, startingPaisa?: number): Promise<number> {
  const starting = startingPaisa ?? (await loadReserveSettings(db, propertyId)).startingPaisa;
  const closed = await db.period.findMany({ where: { propertyId, status: "CLOSED" }, select: { snapshot: true } });
  const kept = closed.reduce((sum, p) => sum + (readSnapshot(p.snapshot)?.reservePaisa ?? 0), 0);
  const spent = await db.houseTransaction.aggregate({ where: { propertyId, kind: "EXPENSE", fromReserve: true, voidedAt: null }, _sum: { amountPaisa: true } });
  return starting + kept - Number(spent._sum.amountPaisa ?? 0);
}

export async function getReserveSettings(propertyId: string): Promise<{ rule: ReserveSettings; balancePaisa: number }> {
  const rule = await loadReserveSettings(prisma, propertyId);
  return { rule, balancePaisa: await reserveBalance(prisma, propertyId, rule.startingPaisa) };
}

export async function saveReserveSettings(propertyId: string, input: ReserveSettings, actor: Actor): Promise<Result<{ rule: ReserveSettings; balancePaisa: number }>> {
  return inTransaction(async (tx) => {
    const rows = await tx.$queryRaw<{ settings: unknown }[]>`SELECT settings FROM properties WHERE id = ${propertyId}::uuid FOR UPDATE`;
    const settings = (rows[0]?.settings ?? {}) as Record<string, unknown>;
    const before = readReserveSettings(settings);
    await tx.property.update({ where: { id: propertyId }, data: { settings: { ...settings, reserve: input } as Prisma.InputJsonObject } });
    await audit(tx, { actorId: actor.id, action: "settings.reserve_updated", entityType: "property", entityId: propertyId, before, after: input, ip: actor.ip, userAgent: actor.userAgent });
    return { rule: input, balancePaisa: await reserveBalance(tx, propertyId, input.startingPaisa) };
  });
}

export type OverrideInput = { amountPaisa: number | null; reason?: string | null };

/** Sets (or, with null, resets) the reserve for one OPEN month (G3). */
export async function setReserveOverride(propertyId: string, month: string, input: OverrideInput, actor: Actor): Promise<Result<{ month: string; overridePaisa: number | null; overrideReason: string | null }>> {
  return inTransaction(async (tx) => {
    const found = await findPeriod(tx, propertyId, month);
    if (!found) throw new Abort(failWith("NOT_FOUND"));
    const rows = await tx.$queryRaw<{ status: string; reserve_override_paisa: bigint | null; reserve_override_reason: string | null }[]>`
      SELECT status, reserve_override_paisa, reserve_override_reason FROM periods WHERE id = ${found.id}::uuid FOR UPDATE`;
    const row = rows[0]!;
    if (row.status === "CLOSED") throw new Abort(failWith("PERIOD_CLOSED"));
    const before = { overridePaisa: row.reserve_override_paisa === null ? null : Number(row.reserve_override_paisa), overrideReason: row.reserve_override_reason };
    const reason = input.amountPaisa === null ? null : input.reason!.trim();
    await tx.period.update({
      where: { id: found.id },
      data: { reserveOverridePaisa: input.amountPaisa === null ? null : BigInt(input.amountPaisa), reserveOverrideReason: reason },
    });
    const after = { overridePaisa: input.amountPaisa, overrideReason: reason };
    await audit(tx, {
      actorId: actor.id,
      action: input.amountPaisa === null ? "period.reserve_reset" : "period.reserve_overridden",
      entityType: "period",
      entityId: found.id,
      before,
      after,
      reason,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
    return { month, ...after };
  });
}

/** SEED_DEMO: the Distribution PRD §11 sample rule (5 %), only while no rule is saved. */
export async function ensureDemoReserve(tx: Prisma.TransactionClient, propertyId: string): Promise<void> {
  const p = await tx.property.findUniqueOrThrow({ where: { id: propertyId }, select: { settings: true } });
  const settings = (p.settings ?? {}) as Record<string, unknown>;
  if (settings.reserve) return;
  await tx.property.update({ where: { id: propertyId }, data: { settings: { ...settings, reserve: { mode: "PERCENT", percentBp: 500, startingPaisa: 0 } } as Prisma.InputJsonObject } });
}
