// Categories (MST-03, §3.7). System categories are locked; none are deleted.
import { randomBytes } from "node:crypto";
import { audit } from "@/lib/audit";
import { diffFields } from "@/lib/diff";
import { failWith, fieldFail, type Actor, type Result } from "@/lib/api/result";
import { prisma } from "@/lib/prisma";
import { toCategoryDto, type CategoryDto } from "./dto";

type Kind = "INCOME" | "EXPENSE";
export type CategoryInput = { kind: Kind; nameEn: string; nameBn: string; sortOrder?: number };
export type CategoryPatch = { kind?: Kind; nameEn?: string; nameBn?: string; isActive?: boolean; sortOrder?: number };

export async function listCategories(propertyId: string, opts: { kind?: Kind; active?: boolean } = {}): Promise<CategoryDto[]> {
  const rows = await prisma.category.findMany({
    where: { propertyId, ...(opts.kind ? { kind: opts.kind } : {}), ...(opts.active === undefined ? {} : { isActive: opts.active }) },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toCategoryDto);
}

export async function createCategory(propertyId: string, input: CategoryInput, actor: Actor): Promise<Result<{ category: CategoryDto }>> {
  const category = await prisma.$transaction(async (tx) => {
    const last = await tx.category.aggregate({ where: { propertyId, kind: input.kind }, _max: { sortOrder: true } });
    const row = await tx.category.create({
      data: {
        propertyId,
        kind: input.kind,
        code: `C_${randomBytes(4).toString("hex").toUpperCase()}`,
        nameEn: input.nameEn,
        nameBn: input.nameBn,
        sortOrder: input.sortOrder ?? (last._max.sortOrder ?? 0) + 10,
      },
    });
    const dto = toCategoryDto(row);
    await audit(tx, { actorId: actor.id, action: "category.created", entityType: "category", entityId: row.id, after: dto, ip: actor.ip, userAgent: actor.userAgent });
    return dto;
  });
  return { ok: true, category };
}

export async function updateCategory(propertyId: string, id: string, patch: CategoryPatch, actor: Actor): Promise<Result<{ category: CategoryDto }>> {
  const current = await prisma.category.findFirst({ where: { id, propertyId } });
  if (!current) return failWith("NOT_FOUND");
  const before = toCategoryDto(current);
  const change = diffFields(before, patch);
  if (!change) return { ok: true, category: before };
  const touched = Object.keys(change.after);
  if (current.isSystem && touched.some((k) => k !== "sortOrder")) return failWith("CATEGORY_LOCKED");
  if (touched.includes("kind")) return fieldFail("kind", "A category's kind can't change.");
  const category = await prisma.$transaction(async (tx) => {
    const row = await tx.category.update({ where: { id }, data: change.after });
    await audit(tx, { actorId: actor.id, action: "category.updated", entityType: "category", entityId: id, ...change, ip: actor.ip, userAgent: actor.userAgent });
    return toCategoryDto(row);
  });
  return { ok: true, category };
}
