// Super Admin reminders (Requests PRD F13, G14; design D10): computed on read
// for the Home note, and emailed once per request and reason by the worker loop.
import { formatRequestNumber, reminderKinds, type ReminderKind } from "@/lib/accounting/requests";
import { todayIsoInDhaka } from "@/lib/clock";
import { prisma } from "@/lib/prisma";
import { notifyRequest } from "./notify";

export type RequestReminder = { id: string; number: string; ownerName: string; kind: ReminderKind; neededBy: string };

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function dueRequests(propertyId?: string) {
  return prisma.moneyRequest.findMany({
    where: { ...(propertyId ? { propertyId } : {}), status: { in: ["PENDING", "APPROVED"] } },
    include: { owner: { select: { displayName: true, userId: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/** Pending more than 3 days, or approved and unpaid past the needed-by date. */
export async function requestReminders(propertyId: string, today = todayIsoInDhaka()): Promise<RequestReminder[]> {
  return (await dueRequests(propertyId)).flatMap((r) =>
    reminderKinds({ status: r.status, askedOn: todayIsoInDhaka(r.createdAt), neededBy: iso(r.neededBy) }, today).map((kind) => ({
      id: r.id,
      number: formatRequestNumber(r.year, r.number),
      ownerName: r.owner.displayName,
      kind,
      neededBy: iso(r.neededBy),
    })),
  );
}

/** One REMINDER email per request, reason and Super Admin — the dedupe key makes reruns no-ops. */
export async function queueRequestReminders(today = todayIsoInDhaka()): Promise<number> {
  let queued = 0;
  for (const r of await dueRequests()) {
    for (const kind of reminderKinds({ status: r.status, askedOn: todayIsoInDhaka(r.createdAt), neededBy: iso(r.neededBy) }, today)) {
      queued += await prisma.$transaction((tx) => notifyRequest(tx, r, "REMINDER", "ADMINS", { actorId: "", actorName: "BariHisab", reminderKind: kind }));
    }
  }
  return queued;
}
