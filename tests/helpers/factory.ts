import type { Locale, Role, UserStatus } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { setPassword } from "@/lib/auth/credentials";

let seq = 0;

export const DEFAULT_PASSWORD = "Gh7!tree-river";

export async function createProperty() {
  return prisma.property.create({ data: { name: "Test House" } });
}

export async function createUser(
  opts: {
    username?: string;
    email?: string;
    roles?: Role[];
    status?: UserStatus;
    password?: string | null;
    locale?: Locale;
    phone?: string;
    firstName?: string;
  } = {},
) {
  seq += 1;
  const username = opts.username ?? `user${seq}_${Date.now() % 100000}`;
  const user = await prisma.user.create({
    data: {
      username,
      displayUsername: username,
      email: opts.email ?? `${username}@example.com`,
      name: opts.firstName ?? username,
      firstName: opts.firstName ?? username,
      status: opts.status ?? "ACTIVE",
      locale: opts.locale ?? "en",
      phone: opts.phone,
      roles: { create: (opts.roles ?? ["OWNER"]).map((role) => ({ role })) },
    },
    include: { roles: true },
  });
  const password = opts.password === undefined ? DEFAULT_PASSWORD : opts.password;
  if (password) await prisma.$transaction((tx) => setPassword(tx, user.id, password));
  return user;
}

// ─── Income & Expenses ───

import { ensureDefaultCategories } from "@/lib/master-data/defaults";
import { monthDate } from "@/lib/periods/month";

export async function createPeriod(propertyId: string, month: string, status: "OPEN" | "CLOSED" = "OPEN") {
  return prisma.period.create({ data: { propertyId, month: monthDate(month), status } });
}

export function setPeriodStatus(periodId: string, status: "OPEN" | "CLOSED") {
  return prisma.period.update({ where: { id: periodId }, data: { status } });
}

export async function createFund(
  propertyId: string,
  opts: { name?: string; type?: "CASH" | "BANK" | "WALLET"; openingPaisa?: number; isActive?: boolean } = {},
) {
  seq += 1;
  return prisma.fundAccount.create({
    data: {
      propertyId,
      name: opts.name ?? `Fund ${seq}`,
      type: opts.type ?? "CASH",
      openingBalancePaisa: BigInt(opts.openingPaisa ?? 0),
      openingDate: new Date("2026-01-01T00:00:00Z"),
      isActive: opts.isActive ?? true,
    },
  });
}

export async function createUnit(
  propertyId: string,
  opts: { name?: string; tenantName?: string | null; rentPaisa?: number; defaultFundAccountId?: string | null; isActive?: boolean } = {},
) {
  seq += 1;
  return prisma.unit.create({
    data: {
      propertyId,
      name: opts.name ?? `Flat ${seq}`,
      tenantName: opts.tenantName === undefined ? `Tenant ${seq}` : opts.tenantName,
      rentPaisa: BigInt(opts.rentPaisa ?? 1800000),
      defaultFundAccountId: opts.defaultFundAccountId ?? null,
      isActive: opts.isActive ?? true,
    },
  });
}

/** Default categories keyed by code. */
export async function seedCategories(propertyId: string) {
  await ensureDefaultCategories(prisma, propertyId);
  const rows = await prisma.category.findMany({ where: { propertyId } });
  return Object.fromEntries(rows.map((c) => [c.code, c])) as Record<string, (typeof rows)[number]>;
}

export async function createTxn(data: {
  propertyId: string;
  periodId: string;
  kind?: "INCOME" | "EXPENSE";
  categoryId: string;
  fundAccountId: string;
  createdById: string;
  amountPaisa?: number;
  txnDate?: string;
  unitId?: string | null;
  vendor?: string | null;
  fromReserve?: boolean;
  voided?: string;
}) {
  return prisma.houseTransaction.create({
    data: {
      propertyId: data.propertyId,
      periodId: data.periodId,
      kind: data.kind ?? "EXPENSE",
      categoryId: data.categoryId,
      fundAccountId: data.fundAccountId,
      createdById: data.createdById,
      amountPaisa: BigInt(data.amountPaisa ?? 100000),
      txnDate: new Date(`${data.txnDate ?? "2026-10-10"}T00:00:00Z`),
      unitId: data.unitId ?? null,
      vendor: data.vendor ?? null,
      fromReserve: data.fromReserve ?? false,
      ...(data.voided ? { voidedAt: new Date(), voidReason: data.voided, voidedById: data.createdById } : {}),
    },
  });
}

/** A property with categories, an Open October, a Closed September, Cash + Bank funds and an admin. */
export async function moneyWorld() {
  const property = await createProperty();
  const categories = await seedCategories(property.id);
  const oct = await createPeriod(property.id, "2026-10");
  const sep = await createPeriod(property.id, "2026-09", "CLOSED");
  const cash = await createFund(property.id, { name: "Cash — with Rayhan", type: "CASH" });
  const bank = await createFund(property.id, { name: "DBBL savings ·· 4471", type: "BANK" });
  const admin = await createUser({ roles: ["SUPER_ADMIN"] });
  const owner = await createUser({ roles: ["OWNER"] });
  return { property, categories, oct, sep, cash, bank, admin, owner };
}
