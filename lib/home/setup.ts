// First-run setup checklist for the Super Admin (Home PRD F12).
import { prisma } from "@/lib/prisma";

export type SetupStepKey = "HOUSE" | "FUNDS" | "SHARES" | "OPENINGS" | "FIRST_MONTH" | "INVITES";
export type SetupDto = { steps: { key: SetupStepKey; done: boolean }[] };

/** The six steps, or null once every one is done. */
export async function setupChecklist(propertyId: string, viewerId: string): Promise<SetupDto | null> {
  const [property, funds, shares, openings, closed, periods, invited] = await Promise.all([
    prisma.property.findUniqueOrThrow({ where: { id: propertyId }, select: { name: true } }),
    prisma.fundAccount.count({ where: { propertyId, isActive: true } }),
    prisma.shareSetItem.count({ where: { shareSet: { propertyId }, units: { gt: 0 } } }),
    prisma.ownerLedgerEntry.count({ where: { propertyId, type: "OPENING" } }),
    prisma.period.count({ where: { propertyId, status: "CLOSED" } }),
    prisma.period.count({ where: { propertyId } }),
    prisma.owner.count({ where: { propertyId, userId: { not: viewerId }, user: { status: { in: ["ACTIVE", "INVITED"] } } } }),
  ]);
  const steps: SetupDto["steps"] = [
    { key: "HOUSE", done: property.name.trim().length > 0 },
    { key: "FUNDS", done: funds > 0 },
    { key: "SHARES", done: shares > 0 },
    { key: "OPENINGS", done: openings > 0 || closed > 0 },
    { key: "FIRST_MONTH", done: periods > 0 },
    { key: "INVITES", done: invited > 0 },
  ];
  return steps.every((s) => s.done) ? null : { steps };
}
