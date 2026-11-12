// Notices nav badge (Notices & Complaints PRD §11 In-app; design D8): unread
// live notices + visible complaints the viewer takes part in with unseen comments.
import { unseenComplaintCount } from "@/lib/complaints/seen";
import type { ComplaintViewer } from "@/lib/complaints/visibility";
import { unreadNoticeCount } from "./notice-read";

export async function noticeBadge(propertyId: string, viewer: ComplaintViewer): Promise<number> {
  const [notices, complaints] = await Promise.all([unreadNoticeCount(propertyId, viewer.userId), unseenComplaintCount(propertyId, viewer)]);
  return notices + complaints;
}
