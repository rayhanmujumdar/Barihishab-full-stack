// Seen tracking (design D8): the unread dot and the Notices badge clear only
// through an explicit "seen" write — reads never write.
import { failWith, type Result } from "@/lib/api/result";
import { now } from "@/lib/clock";
import { prisma } from "@/lib/prisma";
import { findVisible, unseenCount } from "./complaint-read";
import type { ComplaintViewer } from "./visibility";

export async function markSeen(propertyId: string, id: string, viewer: ComplaintViewer): Promise<Result<object>> {
  if (!(await findVisible(prisma, propertyId, id, viewer))) return failWith("NOT_FOUND");
  await prisma.complaintView.upsert({ where: { complaintId_userId: { complaintId: id, userId: viewer.userId } }, create: { complaintId: id, userId: viewer.userId, seenAt: now() }, update: { seenAt: now() } });
  return { ok: true };
}

export const unseenComplaintCount = unseenCount;
