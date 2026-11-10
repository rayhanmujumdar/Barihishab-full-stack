// Owners PRD §2.2 sample data for component tests.
import type { LedgerEntryDto, OwnerDto, OwnerPageData, OwnersData, ShareSetDto } from "./types";

const tags = { superAdmin: false, invitePending: false, noLogin: false };

export function owner(extra: Partial<OwnerDto> = {}): OwnerDto {
  return {
    id: "o-nasrin",
    userId: "u-nasrin",
    displayName: "Nasrin Ahmed",
    initials: "NA",
    sortOrder: 1,
    note: null,
    responsibility: "Elder · signs bank cheques",
    units: 40,
    sharePercent: 40,
    status: "current",
    leftMonth: null,
    tags,
    isViewer: false,
    balancePaisa: -500000,
    balanceLabel: "ADVANCE",
    loanOutstandingPaisa: 0,
    ...extra,
  };
}

export const SAMPLE: OwnerDto[] = [
  owner({ isViewer: true }),
  owner({ id: "o-rayhan", userId: "u-rayhan", displayName: "Rayhan Ahmed", initials: "RA", sortOrder: 2, units: 25, sharePercent: 25, balancePaisa: 0, balanceLabel: "SETTLED", tags: { ...tags, superAdmin: true }, responsibility: "Bookkeeper" }),
  owner({ id: "o-tanvir", userId: null, displayName: "Tanvir Ahmed", initials: "TA", sortOrder: 3, units: 15, sharePercent: 15, balancePaisa: 805585, balanceLabel: "OWED", loanOutstandingPaisa: 3500000, tags: { ...tags, noLogin: true }, responsibility: null }),
  owner({ id: "o-farzana", userId: "u-farzana", displayName: "Farzana Haque", initials: "FH", sortOrder: 4, units: 10, sharePercent: 10, balancePaisa: 870390, balanceLabel: "OWED", responsibility: null }),
  owner({ id: "o-sabrina", userId: "u-sabrina", displayName: "Sabrina Ahmed", initials: "SA", sortOrder: 5, units: 10, sharePercent: 10, balancePaisa: 0, balanceLabel: "SETTLED", tags: { ...tags, invitePending: true }, responsibility: null }),
];

export const TIMELINE: ShareSetDto[] = [
  {
    id: "s-jun",
    effectiveMonth: "2026-06",
    reason: "Gifted 10 units to Sabrina, deed 20 May 2026",
    savedBy: "Rayhan Ahmed",
    savedAt: "2026-05-21T04:00:00.000Z",
    replaced: false,
    totalUnits: 100,
    items: SAMPLE.map((o) => ({ ownerId: o.id, displayName: o.displayName, units: o.units, sharePercent: o.sharePercent })),
  },
];

export function ownersData(extra: Partial<OwnersData> = {}): OwnersData {
  return {
    list: { houseName: "Ahmed Villa", totalUnits: 100, owners: SAMPLE, formerOwners: [] },
    timeline: TIMELINE,
    periods: [
      { month: "2026-10", status: "OPEN" },
      { month: "2026-09", status: "CLOSED" },
    ],
    effectiveMonths: ["2026-10", "2026-11"],
    linkableUsers: [{ id: "u-mitu", name: "Mitu Rahman" }],
    perms: { manage: true, shares: true },
    ...extra,
  };
}

export const ownerPermsOnly = { manage: false, shares: false };

export function entry(extra: Partial<LedgerEntryDto> = {}): LedgerEntryDto {
  return {
    id: "e-1",
    ownerId: "o-tanvir",
    type: "PAYOUT",
    amountPaisa: -500000,
    date: "2026-10-05",
    month: "2026-10",
    fundAccountId: "f-cash",
    fundAccountName: "Cash box",
    method: "BKASH",
    referenceNo: "8FJ2K1",
    note: "For September 2026",
    referenceMonth: null,
    reversesId: null,
    voided: false,
    voidedAt: null,
    voidReason: null,
    isSelf: false,
    flagged: false,
    origin: "DIRECT",
    recordedBy: "Rayhan Ahmed",
    recordedAt: "2026-10-05T04:00:00.000Z",
    attachments: [],
    ...extra,
  };
}

export function ownerPage(extra: Partial<OwnerPageData> = {}): OwnerPageData {
  const opening = entry({ id: "e-0", type: "OPENING", amountPaisa: 1305585, date: "2026-10-01", fundAccountId: null, fundAccountName: null, method: null, referenceNo: null, note: "Owed from the notebook" });
  const payout = entry({ id: "e-1", voided: true, voidReason: "Wrong owner", voidedAt: "2026-10-06T04:00:00.000Z" });
  const reversal = entry({ id: "e-2", type: "REVERSAL", amountPaisa: 500000, date: "2026-10-06", reversesId: "e-1", note: "Wrong owner" });
  const live = entry({ id: "e-3", amountPaisa: -500000, date: "2026-10-07" });
  const rows = [opening, payout, reversal, live];
  let running = 0;
  return {
    owner: {
      ...SAMPLE[2],
      email: null,
      phone: null,
      userName: null,
      year: 2026,
      entitlementPaisa: 0,
      paidOutPaisa: 500000,
      oldestDueMonth: "2026-10",
      shareHistory: [{ shareSetId: "s-jan", effectiveMonth: "2026-01", units: 15, sharePercent: 15, reason: "Initial shares", savedBy: "Rayhan Ahmed", savedAt: "2026-01-01T00:00:00.000Z" }],
      loans: [{ id: "l-1", number: 2, origin: "DIRECT", isSelf: false, flagged: false, ownerId: "o-tanvir", principalPaisa: 3500000, disbursedOn: "2026-03-10", status: "ACTIVE", reason: "Medical", installmentPaisa: null, outstandingPaisa: 3500000 }],
    },
    statement: {
      owner: { id: "o-tanvir", displayName: "Tanvir Ahmed", units: 15, sharePercent: 15 },
      from: "2026-01",
      to: "latest",
      broughtForwardPaisa: 0,
      rows: rows.map((r) => ({ ...r, runningPaisa: (running += r.amountPaisa) })),
      closingPaisa: 805585,
      totals: { OPENING: 1305585, PAYOUT: -1000000, REVERSAL: 500000 },
    },
    months: ["2026-08", "2026-09", "2026-10"],
    latestOpen: "2026-10",
    anyClosed: true,
    funds: [
      { id: "f-cash", name: "Cash box", isActive: true, balancePaisa: 2000000 },
      { id: "f-small", name: "Petty cash", isActive: true, balancePaisa: 100000 },
    ],
    houseFundPaisa: 2100000,
    linkableUsers: [],
    periodMonths: ["2026-08", "2026-09", "2026-10"],
    perms: { pay: true, advance: true, void: true, adjust: true, manage: true, loan: true },
    ...extra,
  };
}

export const ownerPagePermsNone = { pay: false, advance: false, void: false, adjust: false, manage: false, loan: false };
