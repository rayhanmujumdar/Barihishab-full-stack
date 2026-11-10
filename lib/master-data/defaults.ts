// Default categories every property starts with (Income & Expenses PRD §2.2,
// §3.7, EXP-02). System ones are locked: no rename, no deactivate.
import type { Prisma } from "@/lib/generated/prisma/client";

type Seed = { kind: "INCOME" | "EXPENSE"; code: string; nameEn: string; nameBn: string; isSystem?: boolean };

export const SYSTEM_CODES = ["RENT", "ARREAR", "OWNER_GRANT", "ADJUSTMENT_INC", "ADJUSTMENT_EXP", "LOAN_WRITTEN_OFF"] as const;
/** Codes the manual entry form never offers (EXP-05; adjustments have their own endpoint). */
export const NON_MANUAL_CODES = ["OWNER_GRANT", "ADJUSTMENT_INC", "ADJUSTMENT_EXP", "LOAN_WRITTEN_OFF"] as const;

export const DEFAULT_CATEGORIES: readonly Seed[] = [
  // Income
  { kind: "INCOME", code: "RENT", nameEn: "House rent", nameBn: "বাড়ি ভাড়া", isSystem: true },
  { kind: "INCOME", code: "ARREAR", nameEn: "Arrear rent", nameBn: "বকেয়া ভাড়া", isSystem: true },
  { kind: "INCOME", code: "ROOFTOP", nameEn: "Rooftop / tower lease", nameBn: "ছাদ / টাওয়ার ভাড়া" },
  { kind: "INCOME", code: "PARKING", nameEn: "Parking / garage rent", nameBn: "পার্কিং / গ্যারেজ ভাড়া" },
  { kind: "INCOME", code: "OTHER_INC", nameEn: "Other income", nameBn: "অন্যান্য আয়" },
  { kind: "INCOME", code: "ADJUSTMENT_INC", nameEn: "Adjustment", nameBn: "সমন্বয়", isSystem: true },
  // Expense
  { kind: "EXPENSE", code: "ELEC", nameEn: "Electricity", nameBn: "বিদ্যুৎ" },
  { kind: "EXPENSE", code: "GAS", nameEn: "Gas", nameBn: "গ্যাস" },
  { kind: "EXPENSE", code: "WATER", nameEn: "Water", nameBn: "পানি" },
  { kind: "EXPENSE", code: "REPAIR", nameEn: "Repairs", nameBn: "মেরামত" },
  { kind: "EXPENSE", code: "CLEANING", nameEn: "Cleaning & maintenance", nameBn: "পরিষ্কার ও রক্ষণাবেক্ষণ" },
  { kind: "EXPENSE", code: "SALARY", nameEn: "Guard / salary", nameBn: "দারোয়ান / বেতন" },
  { kind: "EXPENSE", code: "LIFT", nameEn: "Lift maintenance", nameBn: "লিফট রক্ষণাবেক্ষণ" },
  { kind: "EXPENSE", code: "GENERATOR", nameEn: "Generator & fuel", nameBn: "জেনারেটর ও জ্বালানি" },
  { kind: "EXPENSE", code: "INTERNET", nameEn: "Internet & cable TV", nameBn: "ইন্টারনেট ও ডিশ" },
  { kind: "EXPENSE", code: "HOLDING_TAX", nameEn: "Holding tax", nameBn: "হোল্ডিং ট্যাক্স" },
  { kind: "EXPENSE", code: "BANK_CHARGE", nameEn: "Bank & mobile banking charges", nameBn: "ব্যাংক ও মোবাইল ব্যাংকিং চার্জ" },
  { kind: "EXPENSE", code: "OWNER_GRANT", nameEn: "Owner special grant", nameBn: "মালিকের বিশেষ অনুদান", isSystem: true },
  { kind: "EXPENSE", code: "OTHER_EXP", nameEn: "Other", nameBn: "অন্যান্য" },
  { kind: "EXPENSE", code: "ADJUSTMENT_EXP", nameEn: "Adjustment", nameBn: "সমন্বয়", isSystem: true },
  // Advances & Loans PRD F10 (migration 20261110000100_loan_written_off_category)
  { kind: "EXPENSE", code: "LOAN_WRITTEN_OFF", nameEn: "Loan written off", nameBn: "ঋণ মওকুফ", isSystem: true },
];

type Db = Pick<Prisma.TransactionClient, "category">;

/** Idempotent: creates missing default categories, never touches existing ones. */
export async function ensureDefaultCategories(db: Db, propertyId: string): Promise<void> {
  await db.category.createMany({
    data: DEFAULT_CATEGORIES.map((c, i) => ({ ...c, propertyId, isSystem: c.isSystem ?? false, sortOrder: i * 10 })),
    skipDuplicates: true,
  });
}

type DemoDb = Pick<Prisma.TransactionClient, "fundAccount" | "unit">;

// Typical Dhaka building: flats + one ground-floor shop. Tenants are left for the admin.
const DEMO_UNITS = [
  { name: "Flat 1A", tenantName: null, rent: 1800000, fund: "BANK" },
  { name: "Flat 1B", tenantName: null, rent: 1800000, fund: "BANK" },
  { name: "Flat 2A", tenantName: null, rent: 2000000, fund: "BANK" },
  { name: "Flat 2B", tenantName: null, rent: 2000000, fund: "BANK" },
  { name: "Flat 3A", tenantName: null, rent: 2200000, fund: "BANK" },
  { name: "Shop G1", tenantName: null, rent: 1200000, fund: "CASH" },
] as const;

/** Common starter units + fund accounts (`SEED_DEMO=true`, PRD §2.2). Idempotent; never touches existing rows. */
export async function ensureDemoData(db: DemoDb, propertyId: string, openingDate: Date): Promise<void> {
  if (!(await db.fundAccount.count({ where: { propertyId } }))) {
    await db.fundAccount.createMany({
      data: [
        { propertyId, name: "Cash in hand", type: "CASH", openingDate },
        { propertyId, name: "Bank account", type: "BANK", openingDate },
        { propertyId, name: "bKash", type: "WALLET", openingDate },
      ],
    });
  }
  const funds = await db.fundAccount.findMany({ where: { propertyId }, orderBy: { createdAt: "asc" } });
  const byType = (t: "CASH" | "BANK") => funds.find((f) => f.type === t)?.id ?? null;
  await db.unit.createMany({
    data: DEMO_UNITS.map((u, i) => ({
      propertyId,
      name: u.name,
      tenantName: u.tenantName,
      rentPaisa: BigInt(u.rent),
      defaultFundAccountId: byType(u.fund),
      sortOrder: i * 10,
    })),
    skipDuplicates: true,
  });
}
