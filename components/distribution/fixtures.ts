// Distribution PRD §11.1 October 2026 preview, as the page receives it.
import type { BoardRow, ClosePreviewDto, DistPerms, DistributionDto } from "./types";

const row = (over: Partial<BoardRow> & Pick<BoardRow, "ownerId" | "displayName" | "initials">): BoardRow => ({
  isViewer: false,
  units: 10,
  sharePercent: 10,
  openingPaisa: 0,
  entitlementPaisa: 845690,
  receivedPaisa: 0,
  advancePaisa: 0,
  loanDeductionPaisa: 0,
  otherPaisa: 0,
  balancePaisa: 0,
  balanceLabel: "SETTLED",
  afterClosePaisa: 845690,
  loanOutstandingPaisa: 0,
  ...over,
});

export function october(over: Partial<DistributionDto> = {}): DistributionDto {
  return {
    month: { key: "2026-10", status: "OPEN", closedBy: null, closedAt: null, reopenCount: 0, isLatestClosed: false, mustCloseFirst: null, firstMonth: false },
    months: [
      { key: "2026-11", status: "OPEN" },
      { key: "2026-10", status: "OPEN" },
      { key: "2026-09", status: "CLOSED" },
    ],
    staircase: {
      incomePaisa: 10300000,
      expensePaisa: 1398000,
      reserveSpentPaisa: 0,
      surplusPaisa: 8902000,
      reservePaisa: 445100,
      reserveSource: "RULE",
      previousDeficitPaisa: 0,
      previousDeficitMonth: "2026-09",
      distributablePaisa: 8456900,
      deficitCarriedPaisa: 0,
    },
    reserve: { rule: { mode: "PERCENT", percentBp: 500, startingPaisa: 0 }, overridePaisa: null, overrideReason: null, balancePaisa: 0 },
    rows: [
      row({ ownerId: "o-n", displayName: "Nasrin Ahmed", initials: "NA", units: 40, sharePercent: 40, entitlementPaisa: 3382760, advancePaisa: 500000, balancePaisa: -500000, balanceLabel: "ADVANCE", afterClosePaisa: 2882760 }),
      row({ ownerId: "o-r", displayName: "Rayhan Ahmed", initials: "RA", units: 25, sharePercent: 25, entitlementPaisa: 2114225, afterClosePaisa: 2114225 }),
      row({ ownerId: "o-t", displayName: "Tanvir Ahmed", initials: "TA", units: 15, sharePercent: 15, entitlementPaisa: 1268535, loanDeductionPaisa: 500000, balancePaisa: 805585, balanceLabel: "OWED", afterClosePaisa: 1574120, loanOutstandingPaisa: 3500000 }),
      row({ ownerId: "o-f", displayName: "Farzana Haque", initials: "FH", isViewer: true, balancePaisa: 870390, balanceLabel: "OWED", afterClosePaisa: 1716080 }),
      row({ ownerId: "o-s", displayName: "Sabrina Ahmed", initials: "SA" }),
    ],
    totals: { entitlementPaisa: 8456900, receivedPaisa: 0, advancePaisa: 500000, loanDeductionPaisa: 500000, otherPaisa: 0 },
    footer: {
      sumEntitlementsPaisa: 8456900,
      distributablePaisa: 8456900,
      balanced: true,
      shares: [
        { name: "Nasrin", units: 40 },
        { name: "Rayhan", units: 25 },
        { name: "Tanvir", units: 15 },
        { name: "Farzana", units: 10 },
        { name: "Sabrina", units: 10 },
      ],
      rounding: "largest-remainder",
    },
    skippedLoans: [],
    reopens: [],
    changes: null,
    paidAfterClose: null,
    ...over,
  };
}

export function closedOctober(over: Partial<DistributionDto> = {}): DistributionDto {
  const d = october();
  return {
    ...d,
    month: { ...d.month, status: "CLOSED", closedBy: "Rayhan Ahmed", closedAt: "2026-11-02T05:00:00.000Z", isLatestClosed: true },
    rows: d.rows.map((r) => ({ ...r, balancePaisa: r.afterClosePaisa ?? r.balancePaisa, balanceLabel: (r.afterClosePaisa ?? 0) > 0 ? "OWED" : "SETTLED", afterClosePaisa: null })),
    ...over,
  };
}

export const ADMIN: DistPerms = { close: true, reopen: true, override: true, pay: true, shares: true };
export const OWNER: DistPerms = { close: false, reopen: false, override: false, pay: false, shares: false };

export function preview(over: Partial<ClosePreviewDto> = {}): ClosePreviewDto {
  return {
    month: "2026-10",
    reopenCount: 0,
    canClose: true,
    mustPass: [
      { code: "SHARES", ok: true },
      { code: "PREVIOUS_CLOSED", ok: true, month: "2026-09" },
      { code: "BALANCED", ok: true },
      { code: "STILL_OPEN", ok: true },
    ],
    warnings: [{ code: "UNPAID_RENT", units: [{ name: "Flat 3A", tenantName: "Nusrat Jahan" }] }],
    whatHappens: {
      entitlementCount: 5,
      entitlementTotalPaisa: 8456900,
      ownerCount: 5,
      deductions: [{ ownerId: "o-t", displayName: "Tanvir Ahmed", amountPaisa: 500000 }],
      skipped: [],
      nextMonthOpens: null,
    },
    changes: null,
    ...over,
  };
}
