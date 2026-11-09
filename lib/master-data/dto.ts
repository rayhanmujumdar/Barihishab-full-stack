// The only shapes in which master data leaves the API. Money as number paisa.
import type { Category, FundAccount, Unit } from "@/lib/generated/prisma/client";

export type UnitDto = {
  id: string;
  name: string;
  tenantName: string | null;
  rentPaisa: number;
  defaultFundAccountId: string | null;
  sortOrder: number;
  isActive: boolean;
};

export type FundAccountDto = {
  id: string;
  name: string;
  type: "CASH" | "BANK" | "WALLET";
  openingBalancePaisa: number;
  openingDate: string;
  isActive: boolean;
  balancePaisa: number;
};

export type CategoryDto = {
  id: string;
  kind: "INCOME" | "EXPENSE";
  code: string;
  nameEn: string;
  nameBn: string;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
};

export const toUnitDto = (u: Unit): UnitDto => ({
  id: u.id,
  name: u.name,
  tenantName: u.tenantName,
  rentPaisa: Number(u.rentPaisa),
  defaultFundAccountId: u.defaultFundAccountId,
  sortOrder: u.sortOrder,
  isActive: u.isActive,
});

export const toFundDto = (f: FundAccount, balancePaisa: number): FundAccountDto => ({
  id: f.id,
  name: f.name,
  type: f.type,
  openingBalancePaisa: Number(f.openingBalancePaisa),
  openingDate: f.openingDate.toISOString().slice(0, 10),
  isActive: f.isActive,
  balancePaisa,
});

export const toCategoryDto = (c: Category): CategoryDto => ({
  id: c.id,
  kind: c.kind,
  code: c.code,
  nameEn: c.nameEn,
  nameBn: c.nameBn,
  isSystem: c.isSystem,
  isActive: c.isActive,
  sortOrder: c.sortOrder,
});
