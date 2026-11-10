// Notices & Complaints seam (Home PRD F5, F9; main PRD NTC-01; design D9).
// That section isn't built yet: Home reads pinned notices and the open
// complaints count only through here, so wiring it later is a body swap.

export type NoticeDto = { id: string; title: string; body: string; urgent: boolean; date: string; unread: boolean };

/** Up to 3 pinned notices, newest first, and whether more exist. */
export async function pinnedNotices(_propertyId: string, _userId: string): Promise<{ items: NoticeDto[]; more: boolean }> {
  return { items: [], more: false };
}

/** Complaints in Open or In review. */
export async function openComplaintsCount(_propertyId: string): Promise<number> {
  return 0;
}
