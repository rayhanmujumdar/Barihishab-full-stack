// Home reminder strips (Home PRD F6, G4, Rule 9): timing and priority live
// in the pure module; this loads open months, unpaid units and overdue requests.
import { pickReminders, reminderMonths, type Reminder, type UnitRef } from "@/lib/accounting/home-reminders";
import { todayIsoInDhaka } from "@/lib/clock";
import { unpaidUnitsIn } from "@/lib/distribution/distribution-service";
import { monthKey } from "@/lib/periods/month";
import { prisma } from "@/lib/prisma";

export type { Reminder };

/** At most two reminders for the Super Admin, minus those hidden today on this device. */
export async function homeReminders(propertyId: string, hidden: readonly string[] = []): Promise<Reminder[]> {
  const today = todayIsoInDhaka();
  const [open, overdue] = await Promise.all([
    prisma.period.findMany({ where: { propertyId, status: "OPEN" }, select: { id: true, month: true } }),
    prisma.moneyRequest.findMany({
      where: { propertyId, status: "APPROVED", neededBy: { lt: new Date(`${today}T00:00:00Z`) } },
      orderBy: [{ neededBy: "asc" }, { createdAt: "asc" }],
      select: { id: true, type: true, amountRequestedPaisa: true, amountApprovedPaisa: true, neededBy: true, owner: { select: { displayName: true } } },
    }),
  ]);
  const idByMonth = new Map(open.map((p) => [monthKey(p.month), p.id]));
  const { closeMonth, rentMonth } = reminderMonths(today, [...idByMonth.keys()]);
  const unpaid: Record<string, UnitRef[]> = {};
  for (const m of [closeMonth, rentMonth]) if (m) unpaid[m] = await unpaidUnitsIn(propertyId, idByMonth.get(m)!);
  return pickReminders({
    closeMonth,
    rentMonth,
    unpaid,
    approvedOverdue: overdue.map((r) => ({
      id: r.id,
      ownerName: r.owner.displayName,
      amountPaisa: Number(r.amountApprovedPaisa ?? r.amountRequestedPaisa),
      type: r.type,
      neededBy: r.neededBy.toISOString().slice(0, 10),
    })),
    hidden,
  });
}
