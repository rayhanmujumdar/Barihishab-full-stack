// Units (MST-01): never deleted; deactivation hides them from new entries.
import { audit } from "@/lib/audit";
import { diffFields } from "@/lib/diff";
import { failWith, fieldFail, type Actor, type Result } from "@/lib/api/result";
import { prisma } from "@/lib/prisma";
import { toUnitDto, type UnitDto } from "./dto";

export type UnitInput = { name: string; tenantName?: string | null; rentPaisa: number; defaultFundAccountId?: string | null; sortOrder?: number };
export type UnitPatch = Partial<UnitInput> & { isActive?: boolean };

const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === "P2002";

async function checkFund(propertyId: string, id: string | null | undefined) {
  if (!id) return null;
  const fund = await prisma.fundAccount.findFirst({ where: { id, propertyId, isActive: true } });
  return fund ? null : fieldFail("defaultFundAccountId", "Pick a fund account.");
}

export async function listUnits(propertyId: string, opts: { active?: boolean } = {}): Promise<UnitDto[]> {
  const rows = await prisma.unit.findMany({
    where: { propertyId, ...(opts.active === undefined ? {} : { isActive: opts.active }) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(toUnitDto);
}

export async function createUnit(propertyId: string, input: UnitInput, actor: Actor): Promise<Result<{ unit: UnitDto }>> {
  const bad = await checkFund(propertyId, input.defaultFundAccountId);
  if (bad) return bad;
  try {
    const unit = await prisma.$transaction(async (tx) => {
      const row = await tx.unit.create({
        data: {
          propertyId,
          name: input.name,
          tenantName: input.tenantName ?? null,
          rentPaisa: BigInt(input.rentPaisa),
          defaultFundAccountId: input.defaultFundAccountId ?? null,
          sortOrder: input.sortOrder ?? 0,
        },
      });
      const dto = toUnitDto(row);
      await audit(tx, { actorId: actor.id, action: "unit.created", entityType: "unit", entityId: row.id, after: dto, ip: actor.ip, userAgent: actor.userAgent });
      return dto;
    });
    return { ok: true, unit };
  } catch (err) {
    if (isUniqueViolation(err)) return failWith("NAME_TAKEN");
    throw err;
  }
}

export async function updateUnit(propertyId: string, id: string, patch: UnitPatch, actor: Actor): Promise<Result<{ unit: UnitDto }>> {
  const current = await prisma.unit.findFirst({ where: { id, propertyId } });
  if (!current) return failWith("NOT_FOUND");
  const bad = await checkFund(propertyId, patch.defaultFundAccountId);
  if (bad) return bad;
  const before = toUnitDto(current);
  const change = diffFields(before, patch);
  if (!change) return { ok: true, unit: before };
  try {
    const unit = await prisma.$transaction(async (tx) => {
      const row = await tx.unit.update({
        where: { id },
        data: { ...patch, ...(patch.rentPaisa === undefined ? {} : { rentPaisa: BigInt(patch.rentPaisa) }) },
      });
      await audit(tx, { actorId: actor.id, action: "unit.updated", entityType: "unit", entityId: id, ...change, ip: actor.ip, userAgent: actor.userAgent });
      return toUnitDto(row);
    });
    return { ok: true, unit };
  } catch (err) {
    if (isUniqueViolation(err)) return failWith("NAME_TAKEN");
    throw err;
  }
}
