// Questioned markers and month notes (Notices & Complaints PRD C8, G10, Rules
// 14–15; design D9): only live complaints the viewer may see count.
import { monthDate } from "@/lib/periods/month";
import { prisma } from "@/lib/prisma";
import type { LinkType } from "./links";
import { LIVE_STATUSES, visibleComplaintWhere, type ComplaintViewer } from "./visibility";

const LIVE = { status: { in: [...LIVE_STATUSES] } };

/** id → newest live visible complaint about it. */
export async function questionedFor(propertyId: string, viewer: ComplaintViewer, type: LinkType, ids: readonly string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const rows = await prisma.complaint.findMany({
    where: { AND: [visibleComplaintWhere(propertyId, viewer), LIVE, { linkType: type, linkId: { in: [...ids] } }] },
    select: { id: true, linkId: true },
    orderBy: { createdAt: "desc" },
  });
  const out: Record<string, string> = {};
  for (const r of rows) out[r.linkId!] ??= r.id;
  return out;
}

/** "{n} open complaint(s) about {Month}" — visible live complaints whose linked month is `month` (YYYY-MM). */
export async function openComplaintCountForMonth(propertyId: string, viewer: ComplaintViewer, month: string): Promise<number> {
  const period = await prisma.period.findFirst({ where: { propertyId, month: monthDate(month) }, select: { id: true } });
  if (!period) return 0;
  return prisma.complaint.count({ where: { AND: [visibleComplaintWhere(propertyId, viewer), LIVE, { periodId: period.id }] } });
}

/** Home desk "Open complaints" (Open + In review, every visibility; Super Admin only). */
export async function openComplaintTotal(propertyId: string): Promise<number> {
  return prisma.complaint.count({ where: { propertyId, ...LIVE } });
}
