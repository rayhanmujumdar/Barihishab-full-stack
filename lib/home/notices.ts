// Notices & Complaints for Home (Home PRD F5, F9; Notices & Complaints PRD
// N5, §13). Home reads pinned notices and the open-complaint count only
// through here, so Home and the Notices page share one source.
import { openComplaintTotal } from "@/lib/complaints/questioned";
import { pinnedForHome, type PinnedNotice } from "@/lib/notices/notice-read";

export type NoticeDto = PinnedNotice;

/** Up to 3 effectively pinned notices, newest first, and whether more exist. */
export function pinnedNotices(propertyId: string, userId: string): Promise<{ items: NoticeDto[]; more: boolean }> {
  return pinnedForHome(propertyId, userId);
}

/** Complaints in Open or In review (every visibility; the desk is Super Admin only). */
export function openComplaintsCount(propertyId: string): Promise<number> {
  return openComplaintTotal(propertyId);
}
