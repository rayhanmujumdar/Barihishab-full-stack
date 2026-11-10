// Advance limit rule (Advances & Loans PRD F14; SET-02): a multiplier of the
// last 3 closed months' average entitlement, in properties.settings.advanceLimit.
import { z } from "zod";
import { inTransaction } from "@/lib/api/in-transaction";
import type { Actor, Result } from "@/lib/api/result";
import { audit } from "@/lib/audit";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

export const MULTIPLIERS = [50, 100, 150, 200] as const;
export const AdvanceLimitSettingsSchema = z.object({ multiplierPct: z.union(MULTIPLIERS.map((m) => z.literal(m)) as [z.ZodLiteral<50>, z.ZodLiteral<100>, z.ZodLiteral<150>, z.ZodLiteral<200>]) });
export type AdvanceLimitSettings = z.infer<typeof AdvanceLimitSettingsSchema>;

const DEFAULT: AdvanceLimitSettings = { multiplierPct: 100 };

export function readAdvanceLimit(settings: unknown): AdvanceLimitSettings {
  const r = AdvanceLimitSettingsSchema.safeParse((settings as { advanceLimit?: unknown } | null)?.advanceLimit);
  return r.success ? r.data : DEFAULT;
}

export async function loadAdvanceLimit(db: Db, propertyId: string): Promise<AdvanceLimitSettings> {
  const p = await db.property.findUniqueOrThrow({ where: { id: propertyId }, select: { settings: true } });
  return readAdvanceLimit(p.settings);
}

export async function saveAdvanceLimit(propertyId: string, input: AdvanceLimitSettings, actor: Actor): Promise<Result<AdvanceLimitSettings>> {
  return inTransaction(async (tx) => {
    const rows = await tx.$queryRaw<{ settings: unknown }[]>`SELECT settings FROM properties WHERE id = ${propertyId}::uuid FOR UPDATE`;
    const settings = (rows[0]?.settings ?? {}) as Record<string, unknown>;
    const before = readAdvanceLimit(settings);
    await tx.property.update({ where: { id: propertyId }, data: { settings: { ...settings, advanceLimit: input } as Prisma.InputJsonObject } });
    await audit(tx, { actorId: actor.id, action: "settings.advance_limit_updated", entityType: "property", entityId: propertyId, before, after: input, ip: actor.ip, userAgent: actor.userAgent });
    return { ok: true as const, ...input };
  });
}
