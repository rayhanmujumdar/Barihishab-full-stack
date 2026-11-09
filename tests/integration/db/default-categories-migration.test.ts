import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES } from "@/lib/master-data/defaults";
import { prisma } from "@/lib/prisma";
import { createProperty } from "../../helpers/factory";

const SQL = readFileSync("prisma/migrations/20261109060000_default_categories/migration.sql", "utf8");

describe("default categories data migration (EXP-02)", () => {
  it("lists exactly the categories the seed creates", () => {
    for (const c of DEFAULT_CATEGORIES) {
      expect(SQL, c.code).toContain(`('${c.kind}', '${c.code}', '${c.nameEn}', '${c.nameBn}', ${c.isSystem ? "true" : "false"},`);
    }
    expect(SQL.match(/\('(INCOME|EXPENSE)',/g)).toHaveLength(DEFAULT_CATEGORIES.length);
  });

  it("backfills every existing property once and leaves edited categories alone", async () => {
    const a = await createProperty();
    const b = await createProperty();
    await prisma.category.create({ data: { propertyId: a.id, kind: "EXPENSE", code: "ELEC", nameEn: "Power (renamed)", nameBn: "বিদ্যুৎ", isActive: false } });
    await prisma.$executeRawUnsafe(SQL);
    await prisma.$executeRawUnsafe(SQL);
    for (const p of [a, b]) expect(await prisma.category.count({ where: { propertyId: p.id } })).toBe(DEFAULT_CATEGORIES.length);
    expect(await prisma.category.findUniqueOrThrow({ where: { propertyId_code: { propertyId: a.id, code: "ELEC" } } })).toMatchObject({ nameEn: "Power (renamed)", isActive: false });
    expect(await prisma.category.count({ where: { propertyId: b.id, isSystem: true } })).toBe(5);
  });
});
