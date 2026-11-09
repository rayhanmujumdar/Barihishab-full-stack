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

// ─── Owners ───

export async function createOwner(propertyId: string, opts: { userId?: string | null; displayName?: string; initials?: string; sortOrder?: number; note?: string } = {}) {
  seq += 1;
  const displayName = opts.displayName ?? `Owner ${seq}`;
  return prisma.owner.create({
    data: {
      propertyId,
      userId: opts.userId ?? null,
      displayName,
      initials: opts.initials ?? displayName.slice(0, 2).toUpperCase(),
      sortOrder: opts.sortOrder ?? seq,
      note: opts.note ?? null,
    },
  });
}

export async function createShareSet(
  propertyId: string,
  createdById: string,
  effectiveMonth: string,
  units: Record<string, number>,
  opts: { reason?: string; replaced?: boolean } = {},
) {
  return prisma.shareSet.create({
    data: {
      propertyId,
      createdById,
      effectiveFrom: monthDate(effectiveMonth),
      reason: opts.reason ?? `Shares from ${effectiveMonth}`,
      replacedAt: opts.replaced ? new Date() : null,
      items: { create: Object.entries(units).map(([ownerId, u]) => ({ ownerId, units: u })) },
    },
  });
}

export async function createLedgerEntry(data: {
  propertyId: string;
  ownerId: string;
  periodId: string;
  createdById: string;
  type: "OPENING" | "ENTITLEMENT" | "PAYOUT" | "ADVANCE" | "LOAN_DEDUCTION" | "ADJUSTMENT" | "REVERSAL";
  amountPaisa: number;
  fundAccountId?: string | null;
  entryDate?: string;
  reversesId?: string | null;
  referencePeriodId?: string | null;
  voided?: string;
  method?: "CASH" | "BANK" | "BKASH" | "NAGAD" | null;
  loanId?: string | null;
}) {
  return prisma.ownerLedgerEntry.create({
    data: {
      propertyId: data.propertyId,
      ownerId: data.ownerId,
      periodId: data.periodId,
      createdById: data.createdById,
      type: data.type,
      amountPaisa: BigInt(data.amountPaisa),
      fundAccountId: data.fundAccountId ?? null,
      method: data.method ?? (data.fundAccountId ? "CASH" : null),
      entryDate: new Date(`${data.entryDate ?? "2026-10-10"}T00:00:00Z`),
      reversesId: data.reversesId ?? null,
      referencePeriodId: data.referencePeriodId ?? null,
      loanId: data.loanId ?? null,
      ...(data.voided ? { voidedAt: new Date(), voidReason: data.voided, voidedById: data.createdById } : {}),
    },
  });
}

export async function createLoan(data: {
  propertyId: string;
  ownerId: string;
  fundAccountId: string;
  createdById: string;
  principalPaisa: number;
  status?: "ACTIVE" | "REPAID";
  installmentPaisa?: number | null;
  disbursedOn?: string;
}) {
  return prisma.loan.create({
    data: {
      propertyId: data.propertyId,
      ownerId: data.ownerId,
      fundAccountId: data.fundAccountId,
      createdById: data.createdById,
      principalPaisa: BigInt(data.principalPaisa),
      disbursedOn: new Date(`${data.disbursedOn ?? "2026-10-10"}T00:00:00Z`),
      method: "CASH",
      reason: "Loan",
      status: data.status ?? "ACTIVE",
      installmentPaisa: data.installmentPaisa ? BigInt(data.installmentPaisa) : null,
    },
  });
}

// ─── Distribution ───

/** Saves the property's reserve rule (Distribution PRD F9). */
export function setReserveRule(propertyId: string, reserve: { mode: "OFF" } | { mode: "PERCENT"; percentBp: number } | { mode: "FIXED"; fixedPaisa: number }, startingPaisa = 0) {
  return prisma.property.update({ where: { id: propertyId }, data: { settings: { reserve: { ...reserve, startingPaisa } } } });
}
