// Test fixtures for the entries UI tests (not imported by app code).
import type { EntriesData, TxnDto } from "./types";

export const ids = {
  cash: "00000000-0000-4000-8000-0000000000c1",
  bank: "00000000-0000-4000-8000-0000000000b1",
  rent: "00000000-0000-4000-8000-0000000000a1",
  arrear: "00000000-0000-4000-8000-0000000000a2",
  otherInc: "00000000-0000-4000-8000-0000000000a3",
  elec: "00000000-0000-4000-8000-0000000000e1",
  water: "00000000-0000-4000-8000-0000000000e2",
  grant: "00000000-0000-4000-8000-0000000000e3",
  flat1a: "00000000-0000-4000-8000-0000000000f1",
};

export function txn(over: Partial<TxnDto> = {}): TxnDto {
  return {
    id: "00000000-0000-4000-8000-000000000101",
    period: "2026-10",
    periodStatus: "OPEN",
    kind: "EXPENSE",
    categoryId: ids.elec,
    category: { code: "ELEC", nameEn: "Electricity", nameBn: "বিদ্যুৎ" },
    unitId: null,
    unitName: null,
    amountPaisa: 630000,
    txnDate: "2026-10-12",
    fundAccountId: ids.bank,
    fundAccountName: "DBBL savings",
    vendor: "DESCO",
    description: "Common meter",
    fromReserve: false,
    referencePeriod: null,
    source: "MANUAL",
    beneficiaryOwnerId: null,
    request: null,
    isCorrected: false,
    voidedAt: null,
    voidReason: null,
    attachmentCount: 0,
    createdAt: "2026-10-12T05:00:00.000Z",
    ...over,
  };
}

export function entriesData(over: Partial<EntriesData> = {}): EntriesData {
  return {
    month: "2026-10",
    status: "OPEN",
    periods: [
      { id: "p11", month: "2026-11", status: "OPEN" },
      { id: "p10", month: "2026-10", status: "OPEN" },
      { id: "p09", month: "2026-09", status: "CLOSED" },
    ],
    latestOpen: "2026-11",
    type: "EXPENSE",
    category: "ALL",
    totals: { incomePaisa: 1800000, expensePaisa: 990000, reserveSpentPaisa: 0, incomeCount: 1, expenseCount: 3 },
    chips: [
      { id: ids.rent, kind: "INCOME", code: "RENT", nameEn: "House rent", nameBn: "বাড়ি ভাড়া", count: 1, totalPaisa: 1800000 },
      { id: ids.elec, kind: "EXPENSE", code: "ELEC", nameEn: "Electricity", nameBn: "বিদ্যুৎ", count: 1, totalPaisa: 630000 },
      { id: ids.water, kind: "EXPENSE", code: "WATER", nameEn: "Water", nameBn: "পানি", count: 2, totalPaisa: 360000 },
    ],
    items: [
      txn({ id: "00000000-0000-4000-8000-000000000103", categoryId: ids.water, category: { code: "WATER", nameEn: "Water", nameBn: "পানি" }, amountPaisa: 50000, txnDate: "2026-10-15", vendor: "Dhaka WASA", voidedAt: "2026-10-16T00:00:00.000Z", voidReason: "Duplicate entry" }),
      txn({ id: "00000000-0000-4000-8000-000000000102", categoryId: ids.water, category: { code: "WATER", nameEn: "Water", nameBn: "পানি" }, amountPaisa: 360000, txnDate: "2026-10-14", vendor: "Dhaka WASA", isCorrected: true, attachmentCount: 2 }),
      txn(),
    ],
    nextCursor: null,
    totalPaisa: 990000,
    categories: [
      { id: ids.rent, kind: "INCOME", code: "RENT", nameEn: "House rent", nameBn: "বাড়ি ভাড়া", isSystem: true, isActive: true, sortOrder: 0 },
      { id: ids.arrear, kind: "INCOME", code: "ARREAR", nameEn: "Arrear rent", nameBn: "বকেয়া ভাড়া", isSystem: true, isActive: true, sortOrder: 10 },
      { id: ids.otherInc, kind: "INCOME", code: "OTHER_INC", nameEn: "Other income", nameBn: "অন্যান্য আয়", isSystem: false, isActive: true, sortOrder: 20 },
      { id: ids.elec, kind: "EXPENSE", code: "ELEC", nameEn: "Electricity", nameBn: "বিদ্যুৎ", isSystem: false, isActive: true, sortOrder: 40 },
      { id: ids.water, kind: "EXPENSE", code: "WATER", nameEn: "Water", nameBn: "পানি", isSystem: false, isActive: true, sortOrder: 60 },
      { id: ids.grant, kind: "EXPENSE", code: "OWNER_GRANT", nameEn: "Owner special grant", nameBn: "মালিকের বিশেষ অনুদান", isSystem: true, isActive: true, sortOrder: 110 },
    ],
    units: [{ id: ids.flat1a, name: "Flat 1A", tenantName: "Kamal Uddin", rentPaisa: 1800000, defaultFundAccountId: ids.bank, sortOrder: 0, isActive: true }],
    funds: [
      { id: ids.cash, name: "Cash", type: "CASH", openingBalancePaisa: 200000, openingDate: "2026-01-01", isActive: true, balancePaisa: 200000 },
      { id: ids.bank, name: "DBBL savings", type: "BANK", openingBalancePaisa: 0, openingDate: "2026-01-01", isActive: true, balancePaisa: 5000000 },
    ],
    perms: { create: true, update: true, void: true, adjust: true, superAdmin: true },
    ...over,
  };
}

export const ownerPerms = { create: false, update: false, void: false, adjust: false, superAdmin: false };
