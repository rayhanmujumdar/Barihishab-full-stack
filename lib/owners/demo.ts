// Owners PRD §2.2 sample owners for SEED_DEMO=true (local demos only).
import type { Prisma } from "@/lib/generated/prisma/client";
import { monthDate } from "@/lib/periods/month";

const OWNERS = [
  { displayName: "Nasrin Ahmed", initials: "NA" },
  { displayName: "Rayhan Ahmed", initials: "RA", admin: true },
  { displayName: "Tanvir Ahmed", initials: "TA" },
  { displayName: "Farzana Haque", initials: "FH" },
  { displayName: "Sabrina Ahmed", initials: "SA" },
] as const;

const SETS = [
  { month: "2026-01", units: [50, 25, 15, 10, 0], reason: "Initial shares" },
  { month: "2026-06", units: [40, 25, 15, 10, 10], reason: "Gifted 10 units to Sabrina, deed 20 May 2026" },
];

/** Idempotent: does nothing once the property has any owner. */
export async function ensureDemoOwners(tx: Prisma.TransactionClient, propertyId: string, adminUserId: string): Promise<void> {
  if (await tx.owner.count({ where: { propertyId } })) return;
  const ids: string[] = [];
  for (const [i, o] of OWNERS.entries()) {
    const row = await tx.owner.create({
      data: { propertyId, displayName: o.displayName, initials: o.initials, sortOrder: i + 1, userId: "admin" in o ? adminUserId : null },
    });
    ids.push(row.id);
  }
  for (const s of SETS) {
    await tx.shareSet.create({
      data: {
        propertyId,
        effectiveFrom: monthDate(s.month),
        reason: s.reason,
        createdById: adminUserId,
        items: { create: s.units.map((units, i) => ({ ownerId: ids[i], units })) },
      },
    });
  }
}
