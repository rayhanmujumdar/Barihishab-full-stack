// Visibility in one place (Rule 8, G18; design D7): every complaint read path
// — list, detail, counts, badges, Questioned markers, files — filters with
// this `where` (SQL) or `canSee` (in memory). Invisible rows answer 404.
import type { Prisma } from "@/lib/generated/prisma/client";

/** The caller and whether they hold `complaint.view.all`. */
export type ComplaintViewer = { userId: string; viewAll: boolean };

export function visibleComplaintWhere(propertyId: string, viewer: ComplaintViewer): Prisma.ComplaintWhereInput {
  return viewer.viewAll ? { propertyId } : { propertyId, OR: [{ visibility: "ALL" }, { createdById: viewer.userId }] };
}

export const LIVE_STATUSES = ["OPEN", "IN_REVIEW"] as const;
export const CLOSED_STATUSES = ["RESOLVED", "REJECTED", "WITHDRAWN"] as const;
