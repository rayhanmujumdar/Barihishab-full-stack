import type { ComplaintDetailDto, ComplaintDto, ComplaintFilter, ComplaintListDto, ThreadItem } from "@/lib/complaints/complaint-read";
import type { LinkItem, LinkOption, LinkType } from "@/lib/complaints/link-types";
import type { NoticeDto, NoticeListDto } from "@/lib/notices/notice-read";

export type { ComplaintDetailDto, ComplaintDto, ComplaintFilter, ComplaintListDto, LinkItem, LinkOption, LinkType, NoticeDto, NoticeListDto, ThreadItem };

export type NoticesPerms = { manage: boolean; create: boolean; decide: boolean };

/** Everything `/notices` renders, loaded on the server (design D11). */
export type NoticesPageData = {
  houseName: string | null;
  perms: NoticesPerms;
  notices: NoticeListDto;
  archived: boolean;
  /** `?notice=` — expanded, scrolled to and marked read on arrival. */
  focusNotice: string | null;
  complaints: ComplaintListDto;
  filter: ComplaintFilter;
  month: string;
  /** Months that exist (YYYY-MM, newest first) for the month filter. */
  months: string[];
  /** `?complaint=` — the open drawer. */
  detail: ComplaintDetailDto | null;
  /** `?raise=1` (optionally `&link=TYPE:id`) — the complaint form, pre-filled. */
  raise: { open: boolean; link: LinkOption | null };
  /** `?new=1` (Super Admin) — the New notice dialog. */
  newNotice: boolean;
};
