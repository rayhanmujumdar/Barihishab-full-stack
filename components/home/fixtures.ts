// Test fixtures for the Home UI tests (Home PRD §9 worked example; not imported by app code).
import { entriesData } from "@/components/entries/fixtures";
import type { ActivityItem, DeskDto, EntryFormData, HouseDto, MeDto, MyRequestDto, NoticeDto, Reminder, SetupDto } from "./types";

export const OWNER_ID = "00000000-0000-4000-8000-0000000000d1";

export const october = { key: "2026-10", open: true, firstMonth: false };

export function me(over: Partial<MeDto> = {}): MeDto {
  return {
    ownerId: OWNER_ID,
    balancePaisa: -500000,
    balanceLabel: "ADVANCE",
    sharePercent: 40,
    entitlementPreviewPaisa: 3382760,
    receivedPaisa: 3481560,
    advancesPaisa: 500000,
    loanOutstandingPaisa: 0,
    loan: null,
    ...over,
  };
}

export const pendingRequest = (over: Partial<MyRequestDto> = {}): MyRequestDto => ({
  id: "00000000-0000-4000-8000-0000000000r1",
  type: "ADVANCE",
  status: "PENDING",
  amountRequestedPaisa: 1000000,
  amountApprovedPaisa: null,
  once: false,
  ...over,
});

export function desk(over: Partial<DeskDto> = {}): DeskDto {
  const parts = { fundPaisa: 12450875, ownerBalancesPaisa: 12000000, reservePaisa: 445100, openNetPaisa: 5775, deficitCarriedPaisa: 0, loansOutstandingPaisa: 0 };
  return {
    fund: {
      totalPaisa: 12450875,
      accounts: [
        { id: "00000000-0000-4000-8000-0000000000c1", name: "Cash — with Rayhan", type: "CASH", balancePaisa: 3100000 },
        { id: "00000000-0000-4000-8000-0000000000b1", name: "DBBL savings ·· 4471", type: "BANK", balancePaisa: 9350875 },
      ],
    },
    reconciliation: { status: "BALANCED", expectedPaisa: 12450875, mismatchPaisa: 0, parts },
    pending: { count: 1, over3Days: 0 },
    openComplaints: 2,
    invites: { waiting: 2, expired: 1 },
    ...over,
  };
}

export const mismatch = (): DeskDto["reconciliation"] => ({
  status: "CHECK",
  expectedPaisa: 12450875,
  mismatchPaisa: -200000,
  parts: { fundPaisa: 12250875, ownerBalancesPaisa: 12000000, reservePaisa: 445100, openNetPaisa: 5775, deficitCarriedPaisa: 0, loansOutstandingPaisa: 0 },
});

export const house = (over: Partial<HouseDto> = {}): HouseDto => ({
  incomePaisa: 10300000,
  expensePaisa: 1398000,
  reservePaisa: 445100,
  previousDeficitPaisa: 0,
  distributablePaisa: 8456900,
  draft: true,
  shortfallPaisa: 0,
  ...over,
});

const item = (over: Partial<ActivityItem>): ActivityItem => ({
  id: "00000000-0000-4000-8000-000000000a01",
  kind: "EXPENSE",
  date: "2026-10-20",
  createdAt: "2026-10-20T06:00:00.000Z",
  category: null,
  owner: null,
  description: null,
  method: null,
  reference: null,
  amountPaisa: 0,
  month: "2026-10",
  entryId: null,
  ...over,
});

export const activity = (): ActivityItem[] => [
  item({ id: "00000000-0000-4000-8000-000000000a01", entryId: "00000000-0000-4000-8000-000000000a01", category: { nameEn: "Cleaning & maintenance", nameBn: "পরিচ্ছন্নতা ও রক্ষণাবেক্ষণ" }, description: "Stairs, roof & drain cleaning", amountPaisa: -300000 }),
  item({ id: "00000000-0000-4000-8000-000000000a02", kind: "ADVANCE", date: "2026-10-12", owner: { id: OWNER_ID, name: "Nasrin Ahmed" }, method: "BANK", reference: "TX4134", amountPaisa: -500000 }),
  item({ id: "00000000-0000-4000-8000-000000000a03", kind: "INCOME", date: "2026-10-10", entryId: "00000000-0000-4000-8000-000000000a03", category: { nameEn: "Other income", nameBn: "অন্যান্য আয়" }, description: "Rooftop tower lease", amountPaisa: 1500000 }),
];

export const notices = (): NoticeDto[] => [
  { id: "00000000-0000-4000-8000-0000000000n1", title: "Water tank cleaning", body: "The roof tank will be cleaned on Friday. Water will be off from 9 am to 1 pm, so please store enough water the night before. The caretaker will check every flat's tap afterwards.", urgent: true, date: "2026-10-18", unread: true },
  { id: "00000000-0000-4000-8000-0000000000n2", title: "Gate timing", body: "The main gate closes at 11 pm.", urgent: false, date: "2026-10-02", unread: false },
];

export const rentReminder = (): Reminder => ({ key: "RENT_STATUS", kind: "RENT_STATUS", month: "2026-10", units: [{ name: "Flat 3A", tenantName: "Nusrat Jahan" }] });
export const closeReminder = (): Reminder => ({ key: "CLOSE_MONTH", kind: "CLOSE_MONTH", month: "2026-10", units: [] });
export const overdueReminder = (): Reminder => ({
  key: "APPROVED_UNPAID:00000000-0000-4000-8000-0000000000r1",
  kind: "APPROVED_UNPAID",
  request: { id: "00000000-0000-4000-8000-0000000000r1", ownerName: "Nasrin Ahmed", amountPaisa: 1000000, type: "ADVANCE", neededBy: "2026-10-18" },
});

export const setup = (): SetupDto => ({
  steps: [
    { key: "HOUSE", done: true },
    { key: "FUNDS", done: false },
    { key: "SHARES", done: false },
    { key: "OPENINGS", done: false },
    { key: "FIRST_MONTH", done: false },
    { key: "INVITES", done: false },
  ],
});

export function formData(): EntryFormData {
  const d = entriesData();
  return { month: d.month, status: d.status, latestOpen: d.latestOpen, periods: d.periods, categories: d.categories, units: d.units, funds: d.funds };
}
