import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES } from "@/lib/master-data/defaults";
import { prisma } from "@/lib/prisma";
import { createProperty } from "../../helpers/factory";

const SQL = readFileSync("prisma/migrations/20261109060000_default_categories/migration.sql", "utf8");
// Categories added after the first data migration ship in their own migration.
const LATER = readFileSync("prisma/migrations/20261110000100_loan_written_off_category/migration.sql", "utf8");
const FIRST = DEFAULT_CATEGORIES.filter((c) => c.code !== "LOAN_WRITTEN_OFF");

describe("default categories data migration (EXP-02)", () => {
  it("lists exactly the categories the seed creates", () => {
    for (const c of FIRST) {
      expect(SQL, c.code).toContain(`('${c.kind}', '${c.code}', '${c.nameEn}', '${c.nameBn}', ${c.isSystem ? "true" : "false"},`);
    }
    expect(SQL.match(/\('(INCOME|EXPENSE)',/g)).toHaveLength(FIRST.length);
    expect(LATER).toContain("'LOAN_WRITTEN_OFF', 'Loan written off', 'ঋণ মওকুফ', true");
  });

  it("backfills every existing property once and leaves edited categories alone", async () => {
    const a = await createProperty();
    const b = await createProperty();
    await prisma.category.create({ data: { propertyId: a.id, kind: "EXPENSE", code: "ELEC", nameEn: "Power (renamed)", nameBn: "বিদ্যুৎ", isActive: false } });
    await prisma.$executeRawUnsafe(SQL);
    await prisma.$executeRawUnsafe(SQL);
    await prisma.$executeRawUnsafe(LATER);
    for (const p of [a, b]) expect(await prisma.category.count({ where: { propertyId: p.id } })).toBe(DEFAULT_CATEGORIES.length);
    expect(await prisma.category.findUniqueOrThrow({ where: { propertyId_code: { propertyId: a.id, code: "ELEC" } } })).toMatchObject({ nameEn: "Power (renamed)", isActive: false });
    expect(await prisma.category.count({ where: { propertyId: b.id, isSystem: true } })).toBe(6);
  });
});
