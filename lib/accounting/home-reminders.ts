// Home reminder timing and priority (Home PRD F6, G4, Rule 9). Pure: the
// Home read model loads open months, unpaid units and overdue requests.
import type { RequestType } from "./requests";

export type UnitRef = { name: string; tenantName: string | null };
export type OverdueRequest = { id: string; ownerName: string; amountPaisa: number; type: RequestType; neededBy: string };

export type Reminder =
  | { key: "CLOSE_MONTH"; kind: "CLOSE_MONTH"; month: string; units: UnitRef[] }
  | { key: "RENT_STATUS"; kind: "RENT_STATUS"; month: string; units: UnitRef[] }
  | { key: `APPROVED_UNPAID:${string}`; kind: "APPROVED_UNPAID"; request: OverdueRequest };

export type ReminderKind = Reminder["kind"];

/** The rent reminder starts on this day of the month (G4). */
export const RENT_REMINDER_DAY = 10;
/** At most this many strips show at once (F6). */
export const MAX_REMINDERS = 2;

/**
 * Which months the reminders are about on `today` (Asia/Dhaka "YYYY-MM-DD"):
 * the oldest open month before today's month must close; today's month gets
 * the rent reminder from the 10th while it is open.
 */
export function reminderMonths(today: string, openMonths: readonly string[]): { closeMonth: string | null; rentMonth: string | null } {
  const current = today.slice(0, 7);
  const behind = openMonths.filter((m) => m < current).sort();
  const day = Number(today.slice(8, 10));
  return {
    closeMonth: behind[0] ?? null,
    rentMonth: day >= RENT_REMINDER_DAY && openMonths.includes(current) ? current : null,
  };
}

export type ReminderInput = {
  closeMonth: string | null;
  rentMonth: string | null;
  /** Unpaid units per month key. */
  unpaid: Readonly<Record<string, UnitRef[]>>;
  approvedOverdue: readonly OverdueRequest[];
  /** Reminder keys hidden for today on this device. */
  hidden: readonly string[];
};

/** Most urgent first: close the month, rent status, approved-not-paid; hidden ones dropped; at most two. */
export function pickReminders(i: ReminderInput): Reminder[] {
  const all: Reminder[] = [];
  if (i.closeMonth) all.push({ key: "CLOSE_MONTH", kind: "CLOSE_MONTH", month: i.closeMonth, units: i.unpaid[i.closeMonth] ?? [] });
  const rentUnits = i.rentMonth ? (i.unpaid[i.rentMonth] ?? []) : [];
  if (i.rentMonth && rentUnits.length) all.push({ key: "RENT_STATUS", kind: "RENT_STATUS", month: i.rentMonth, units: rentUnits });
  for (const request of i.approvedOverdue) all.push({ key: `APPROVED_UNPAID:${request.id}`, kind: "APPROVED_UNPAID", request });
  const hidden = new Set(i.hidden);
  return all.filter((r) => !hidden.has(r.key)).slice(0, MAX_REMINDERS);
}
