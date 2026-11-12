import type { Metadata } from "next";
import { Suspense } from "react";
import { Forbidden } from "@/components/app/Forbidden";
import { noticesTab } from "@/components/notices/format";
import { NoticesView } from "@/components/notices/NoticesView";
import type { NoticesPageData } from "@/components/notices/types";
import { NoticesSkeleton } from "@/components/skeletons/pages";
import { isUuid } from "@/lib/api/params";
import { requirePagePermission } from "@/lib/auth/server";
import { complaintViewer } from "@/lib/complaints/actor";
import { COMPLAINT_FILTERS, complaintDetail, listComplaints, type ComplaintFilter } from "@/lib/complaints/complaint-read";
import { LINK_TYPES, linkOption, type LinkType } from "@/lib/complaints/links";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { listNotices } from "@/lib/notices/notice-read";
import { can } from "@/lib/permissions";
import { isMonthKey, monthKey } from "@/lib/periods/month";
import { prisma } from "@/lib/prisma";
import { currentPropertyId } from "@/lib/property";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const limitOf = (v: string | undefined) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= 200 ? n : undefined;
};

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "meta.notices") };
}

/** Notices & complaints (Notices & Complaints PRD N1–N5, C1–C8; main PRD S10 `/notices`). */
export default async function NoticesPage({ searchParams }: { searchParams: Search }) {
  const locale = await getLocale();
  return (
    <Suspense fallback={<NoticesSkeleton locale={locale} />}>
      <Notices searchParams={searchParams} />
    </Suspense>
  );
}

async function Notices({ searchParams }: { searchParams: Search }) {
  const locale = await getLocale();
  const viewer = await requirePagePermission("notice.view");
  if (!viewer) return <Forbidden locale={locale} />;
  const sp = await searchParams;
  const propertyId = await currentPropertyId();
  const perms = { manage: can(viewer, "notice.manage"), create: can(viewer, "complaint.create"), decide: can(viewer, "complaint.decide") };
  const reader = complaintViewer({ userId: viewer.id, permissions: viewer.permissions }, locale);

  const tab = noticesTab({ tab: one(sp.tab), complaint: one(sp.complaint), raise: one(sp.raise), filter: one(sp.filter), month: one(sp.month), climit: one(sp.climit) });
  const archived = one(sp.archived) === "1";
  const asked = one(sp.filter) ?? "all";
  const filter: ComplaintFilter = (COMPLAINT_FILTERS as readonly string[]).includes(asked) ? (asked as ComplaintFilter) : "all";
  const m = one(sp.month) ?? "";
  const month = isMonthKey(m) ? m : "";
  const complaintId = one(sp.complaint);
  const noticeId = one(sp.notice);
  const raise = one(sp.raise) === "1";
  const [linkType, linkId] = (one(sp.link) ?? "").split(":");

  // Sequential reads keep the pool small; each is a handful of queries on one house.
  const notices = await listNotices(propertyId, { userId: viewer.id, manage: perms.manage }, { archived, limit: limitOf(one(sp.nlimit)) });
  // The Notices tab still needs its list (unread badge, New notice reach); complaints load only on their tab.
  const onComplaints = tab === "complaints";
  const complaints = onComplaints ? await listComplaints(propertyId, reader, { filter, month: month || undefined, limit: limitOf(one(sp.climit)) }) : { items: [], more: false };
  const months = onComplaints ? (await prisma.period.findMany({ where: { propertyId }, select: { month: true }, orderBy: { month: "desc" } })).map((p) => monthKey(p.month)) : [];
  const detail = isUuid(complaintId) ? await complaintDetail(prisma, propertyId, complaintId!, reader) : null;
  const link =
    raise && perms.create && isUuid(linkId) && (LINK_TYPES as readonly string[]).includes(linkType)
      ? await linkOption(propertyId, { type: linkType as LinkType, id: linkId }, locale, { userId: viewer.id, requestViewAll: reader.requestViewAll })
      : null;
  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { name: true } });

  const data: NoticesPageData = {
    houseName: property?.name ?? null,
    tab,
    perms,
    notices,
    archived,
    focusNotice: isUuid(noticeId) ? noticeId! : null,
    complaints,
    filter,
    month,
    months,
    detail,
    raise: { open: raise, link },
    newNotice: one(sp.new) === "1",
  };
  return <NoticesView locale={locale} data={data} />;
}
