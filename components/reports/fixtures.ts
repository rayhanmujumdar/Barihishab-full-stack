// Report DTO fixtures for UI tests (Reports PRD §9 sample house, Oct 2026).
import type { MonthFigure } from "@/lib/accounting/reports";
import type { ExpenseAnalysisDto, FundsReportDto, MonthlyReportDto, RentRollDto, YearlyReportDto } from "@/lib/reports/dto";

const house = { name: "Ahmed Villa", address: "House 12, Road 5, Mirpur" };
const entry = (id: string, amountPaisa: number, extra: Partial<MonthlyReportDto["income"]["categories"][number]["entries"][number]> = {}) => ({
  id,
  date: "2026-10-10",
  description: null,
  vendor: null,
  unitName: null,
  fundName: "Cash",
  amountPaisa,
  fromReserve: false,
  attachments: [],
  ...extra,
});

const owner = (ownerId: string, displayName: string, units: number, entitlementPaisa: number, balancePaisa: number, extra: Partial<MonthlyReportDto["owners"]["rows"][number]> = {}) => ({
  ownerId,
  displayName,
  initials: displayName.slice(0, 2).toUpperCase(),
  units,
  sharePercent: units,
  openingPaisa: 0,
  entitlementPaisa,
  receivedPaisa: 0,
  advancePaisa: 0,
  loanDeductionPaisa: 0,
  otherPaisa: 0,
  balancePaisa,
  balanceLabel: balancePaisa > 0 ? ("OWED" as const) : balancePaisa < 0 ? ("ADVANCE" as const) : ("SETTLED" as const),
  loanOutstandingPaisa: 0,
  ...extra,
});

export const october: MonthlyReportDto = {
  house,
  month: { key: "2026-10", status: "DRAFT", closedAt: null, closedBy: null },
  months: [
    { key: "2026-10", status: "OPEN" },
    { key: "2026-09", status: "CLOSED" },
  ],
  summary: { incomePaisa: 10300000, expensesAllPaisa: 1398000, distributablePaisa: 8456900, deficitCarriedPaisa: 0 },
  income: {
    totalPaisa: 10300000,
    count: 6,
    categories: [
      { categoryId: "c-rent", code: "RENT", nameEn: "House rent", nameBn: "বাড়ি ভাড়া", count: 5, amountPaisa: 8800000, shareBp: 8544, previousPaisa: null, entries: [entry("t-rent", 1800000, { unitName: "Flat 2A" })] },
      { categoryId: "c-roof", code: "ROOFTOP", nameEn: "Rooftop / tower lease", nameBn: "ছাদ / টাওয়ার ভাড়া", count: 1, amountPaisa: 1500000, shareBp: 1456, previousPaisa: null, entries: [entry("t-roof", 1500000)] },
    ],
  },
  expenses: {
    totalPaisa: 1398000,
    fromReservePaisa: 0,
    count: 4,
    categories: [
      {
        categoryId: "c-elec",
        code: "ELEC",
        nameEn: "Electricity",
        nameBn: "বিদ্যুৎ",
        count: 1,
        amountPaisa: 630000,
        shareBp: 4506,
        previousPaisa: 400000,
        entries: [entry("t-elec", 630000, { description: "DESCO bill", vendor: "DESCO", date: "2026-10-08", attachments: [{ id: "a-bill", fileName: "desco.pdf", mime: "application/pdf" }] })],
      },
      { categoryId: "c-water", code: "WATER", nameEn: "Water", nameBn: "পানি", count: 1, amountPaisa: 360000, shareBp: 2575, previousPaisa: 350000, entries: [entry("t-water", 360000, { fromReserve: false })] },
      { categoryId: "c-clean", code: "CLEANING", nameEn: "Cleaning & maintenance", nameBn: "পরিষ্কার ও রক্ষণাবেক্ষণ", count: 1, amountPaisa: 300000, shareBp: 2146, previousPaisa: 0, entries: [entry("t-clean", 300000, { fromReserve: true })] },
      { categoryId: "c-gas", code: "GAS", nameEn: "Gas", nameBn: "গ্যাস", count: 1, amountPaisa: 108000, shareBp: 773, previousPaisa: 108000, entries: [entry("t-gas", 108000)] },
    ],
  },
  staircase: {
    incomePaisa: 10300000,
    expensesCountedPaisa: 1398000,
    reserveSpentPaisa: 0,
    reservePaisa: 445100,
    reserveSource: "RULE",
    previousDeficitPaisa: 0,
    previousDeficitMonth: null,
    distributablePaisa: 8456900,
    deficitCarriedPaisa: 0,
  },
  owners: {
    rows: [
      owner("o-nasrin", "Nasrin Ahmed", 40, 3382760, -500000, { advancePaisa: 500000 }),
      owner("o-rayhan", "Rayhan Ahmed", 25, 2114225, 0),
      owner("o-tanvir", "Tanvir Ahmed", 15, 1268535, 805585, { loanDeductionPaisa: 500000, loanOutstandingPaisa: 3500000, openingPaisa: 805585 }),
    ],
    totals: { openingPaisa: 805585, entitlementPaisa: 6765520, receivedPaisa: 0, advancePaisa: 500000, loanDeductionPaisa: 500000, otherPaisa: 0, balancePaisa: 305585, loanOutstandingPaisa: 3500000 },
  },
  notes: { reopen: null, overrideReason: null, unpaidUnits: [{ name: "Flat 3A", tenantName: "Nusrat Jahan" }], deficit: null },
  compare: {
    lastMonth: { key: "2026-09", status: "FINAL", incomePaisa: 12500000, expensesAllPaisa: 1398000, distributablePaisa: 9000000 },
    lastYear: null,
  },
  empty: false,
};

export const september: MonthlyReportDto = {
  ...october,
  month: { key: "2026-09", status: "FINAL", closedAt: "2026-10-03T05:00:00.000Z", closedBy: "Rayhan Ahmed" },
  summary: { incomePaisa: 0, expensesAllPaisa: 0, distributablePaisa: 0, deficitCarriedPaisa: 0 },
  income: { totalPaisa: 0, count: 0, categories: [] },
  expenses: { totalPaisa: 0, fromReservePaisa: 0, count: 0, categories: [] },
  notes: { reopen: { at: "2026-10-05T04:00:00.000Z", reason: "Plumber bill was missed" }, overrideReason: null, unpaidUnits: [], deficit: null },
  compare: { lastMonth: null, lastYear: null },
  empty: true,
};

const fig = (incomePaisa: number, expensesAllPaisa: number, distributablePaisa: number, extra: Partial<MonthFigure> = {}): MonthFigure => ({
  incomePaisa,
  expensesAllPaisa,
  fromReservePaisa: 0,
  expensesCountedPaisa: expensesAllPaisa,
  reservePaisa: 0,
  previousDeficitPaisa: 0,
  distributablePaisa,
  deficitCarriedPaisa: 0,
  ...extra,
});

export const year2026: YearlyReportDto = {
  house,
  year: 2026,
  years: [2026],
  empty: false,
  months: Array.from({ length: 12 }, (_, i) => {
    const month = `2026-${String(i + 1).padStart(2, "0")}`;
    if (i === 3) return { month, status: "FINAL" as const, figure: fig(12500000, 17078000, 0, { deficitCarriedPaisa: 4578000 }) };
    if (i < 9) return { month, status: "FINAL" as const, figure: fig(12500000, 4000000, 8000000) };
    if (i === 9) return { month, status: "DRAFT" as const, figure: fig(10300000, 1398000, 8456900, { reservePaisa: 445100 }) };
    return { month, status: "NONE" as const, figure: null };
  }),
  totals: {
    closed: { incomePaisa: 112500000, expensesAllPaisa: 49078000, fromReservePaisa: 1800000, reservePaisa: 3672900, distributablePaisa: 64000000 },
    draft: { incomePaisa: 10300000, expensesAllPaisa: 1398000, fromReservePaisa: 0, reservePaisa: 445100, distributablePaisa: 8456900 },
    closedCount: 9,
    draftCount: 1,
  },
  topExpenseCategories: [{ categoryId: "c-rep", code: "REPAIR", nameEn: "Repairs", nameBn: "মেরামত", amountPaisa: 17570000, shareBp: 3753 }],
  owners: {
    rows: [
      {
        ownerId: "o-nasrin",
        displayName: "Nasrin Ahmed",
        unitsNow: 40,
        sharePercentNow: 40,
        shareChanges: [{ month: "2026-06", unitsBefore: 50, unitsAfter: 40, percentBefore: 50, percentAfter: 40 }],
        openingPaisa: 1200000,
        entitlementPaisa: 29224070,
        paidOutPaisa: 30424070,
        advancesPaisa: 500000,
        loanDeductionPaisa: 0,
        otherPaisa: 0,
        balanceNowPaisa: -500000,
        balanceLabel: "ADVANCE",
        loanOutstandingPaisa: 0,
      },
    ],
    totals: { openingPaisa: 1200000, entitlementPaisa: 29224070, paidOutPaisa: 30424070, advancesPaisa: 500000, loanDeductionPaisa: 0, otherPaisa: 0, balanceNowPaisa: -500000, loanOutstandingPaisa: 0 },
  },
};

export const emptyYear: YearlyReportDto = {
  ...year2026,
  year: 2025,
  empty: true,
  months: Array.from({ length: 12 }, (_, i) => ({ month: `2025-${String(i + 1).padStart(2, "0")}`, status: "NONE" as const, figure: null })),
  totals: { closed: { ...year2026.totals.draft, incomePaisa: 0, expensesAllPaisa: 0, reservePaisa: 0, distributablePaisa: 0 }, draft: { incomePaisa: 0, expensesAllPaisa: 0, fromReservePaisa: 0, reservePaisa: 0, distributablePaisa: 0 }, closedCount: 0, draftCount: 0 },
  topExpenseCategories: [],
};

export const rentRoll2026: RentRollDto = {
  house,
  year: 2026,
  years: [2026],
  months: Array.from({ length: 12 }, (_, i) => ({
    key: `2026-${String(i + 1).padStart(2, "0")}`,
    status: i === 9 ? ("DRAFT" as const) : i === 8 ? ("FINAL" as const) : ("NONE" as const),
    totalPaisa: i === 9 ? 1800000 : 0,
    expectedPaisa: i >= 8 && i <= 9 ? 3600000 : null,
    collectionBp: i === 9 ? 5000 : i === 8 ? 0 : null,
  })),
  rows: [
    {
      unitId: "u-2a",
      name: "Flat 2A",
      tenantName: "Karim Uddin",
      cells: Array.from({ length: 12 }, (_, i) => (i === 9 ? { kind: "PAID" as const, amountPaisa: 1800000, entryIds: ["t-rent"] } : i === 8 ? { kind: "ARREAR" as const, paidIn: "2026-10", amountPaisa: 1800000, entryIds: ["t-arrear"] } : { kind: "NONE" as const })),
      totalPaisa: 1800000,
      expectedPaisa: 3600000,
    },
    { unitId: "u-3a", name: "Flat 3A", tenantName: "Nusrat Jahan", cells: Array.from({ length: 12 }, () => ({ kind: "NONE" as const })), totalPaisa: 0, expectedPaisa: 3600000 },
  ],
};

export const repairs: ExpenseAnalysisDto = {
  house,
  from: "2026-01",
  to: "2026-12",
  categoryIds: ["c-rep"],
  totalPaisa: 17570000,
  fromReservePaisa: 1800000,
  count: 3,
  byCategory: [{ categoryId: "c-rep", code: "REPAIR", nameEn: "Repairs", nameBn: "মেরামত", amountPaisa: 17570000, shareBp: 10000, count: 3 }],
  topVendors: [
    { vendor: "Roof Ltd", amountPaisa: 15770000, count: 2 },
    { vendor: null, amountPaisa: 1800000, count: 1 },
  ],
  trend: Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, "0")}`, amounts: (i === 3 ? { "c-rep": 14500000 } : {}) as Record<string, number>, totalPaisa: i === 3 ? 14500000 : 0 })),
  topExpenses: [{ id: "t-roof", date: "2026-04-05", month: "2026-04", categoryNameEn: "Repairs", categoryNameBn: "মেরামত", description: "Roof waterproofing", vendor: "Roof Ltd", amountPaisa: 14500000 }],
  categories: [
    { id: "c-rep", code: "REPAIR", nameEn: "Repairs", nameBn: "মেরামত" },
    { id: "c-elec", code: "ELEC", nameEn: "Electricity", nameBn: "বিদ্যুৎ" },
  ],
};

export const fundsOct: FundsReportDto = {
  house,
  period: { kind: "month", month: "2026-10" },
  rows: [
    { fundAccountId: "f-cash", name: "Cash — with Rayhan", type: "CASH", isActive: true, openingPaisa: -3500000, incomePaisa: 10300000, expensesPaisa: 1398000, ownerPaymentsPaisa: 500000, loansOutPaisa: 0, loanRepaymentsPaisa: 0, closingPaisa: 4902000 },
    { fundAccountId: "f-old", name: "Old wallet", type: "WALLET", isActive: false, openingPaisa: 100000, incomePaisa: 0, expensesPaisa: 100000, ownerPaymentsPaisa: 0, loansOutPaisa: 0, loanRepaymentsPaisa: 0, closingPaisa: 0 },
  ],
  totals: { openingPaisa: -3400000, incomePaisa: 10300000, expensesPaisa: 1498000, ownerPaymentsPaisa: 500000, loansOutPaisa: 0, loanRepaymentsPaisa: 0, closingPaisa: 4902000 },
  months: october.months,
  years: [2026],
};
