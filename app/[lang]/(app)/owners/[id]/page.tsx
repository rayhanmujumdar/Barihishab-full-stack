import { questionedFor } from "@/lib/complaints/questioned";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Forbidden } from "@/components/app/Forbidden";
import { OwnerDetail } from "@/components/owners/OwnerDetail";
import { isUuid } from "@/lib/api/params";
import { requirePagePermission } from "@/lib/auth/server";
import { todayIsoInDhaka } from "@/lib/clock";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { listFunds } from "@/lib/master-data/fund-service";
import { ownerStatement } from "@/lib/owners/ledger-service";
import { getOwnerDetail } from "@/lib/owners/owner-service";
import { linkableUsers, parseRange } from "@/lib/owners/page-data";
import { ensureCurrentPeriod, listPeriods } from "@/lib/periods/period-service";
import { advanceLimit } from "@/lib/accounting/owners";
import { loadAdvanceLimit } from "@/lib/loans/settings-service";
import { recentEntitlements } from "@/lib/owners/ledger-service";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { currentPropertyId } from "@/lib/property";
import { OwnerDetailSkeleton } from "@/components/skeletons/pages";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "meta.owner") };
}

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Owner detail & statement (Owners PRD F2, F3, F5, F11–F14). */
export default async function OwnerPage(props: Props) {
  const locale = await getLocale();
  return (
    <Suspense fallback={<OwnerDetailSkeleton locale={locale} />}>
      <Owner {...props} />
    </Suspense>
  );
}

async function Owner({ params, searchParams }: Props) {
  const locale = await getLocale();
  const viewer = await requirePagePermission("owner.view");
  if (!viewer) return <Forbidden locale={locale} />;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const range = parseRange(await searchParams, todayIsoInDhaka());
  const propertyId = await currentPropertyId();
  await ensureCurrentPeriod(propertyId);

  const owner = await getOwnerDetail(propertyId, id, viewer.id, range.year);
  if (!owner) notFound();
  const perms = {
    pay: can(viewer, "payout.create"),
    advance: can(viewer, "advance.create"),
    void: can(viewer, "ledger.void"),
    adjust: can(viewer, "ledger.adjust"),
    manage: can(viewer, "owner.manage"),
    loan: can(viewer, "loan.manage"),
  };
  const [statement, { items: periods, latestOpen }, funds, users] = await Promise.all([
    ownerStatement(propertyId, { id: owner.id, displayName: owner.displayName, units: owner.units, sharePercent: owner.sharePercent }, range.from, range.to),
    listPeriods(propertyId),
    perms.pay || perms.advance ? listFunds(propertyId) : Promise.resolve([]),
    perms.manage ? linkableUsers(propertyId) : Promise.resolve([]),
  ]);
  const monthsAsc = periods.map((p) => p.month).sort();
  const advanceLimitPaisa = perms.advance
    ? advanceLimit(await recentEntitlements(prisma, propertyId, owner.id), (await loadAdvanceLimit(prisma, propertyId)).multiplierPct)
    : null;
  const months = latestOpen ? monthsAsc.filter((m) => m <= latestOpen) : monthsAsc;
  const complaints = can(viewer, "complaint.view")
    ? {
        questioned: await questionedFor(propertyId, { userId: viewer.id, viewAll: can(viewer, "complaint.view.all") }, "LEDGER", statement.rows.map((r) => r.id)),
        complain: can(viewer, "complaint.create"),
      }
    : undefined;

  return (
    <OwnerDetail
      locale={locale}
      data={{
        owner,
        statement,
        months,
        latestOpen,
        anyClosed: periods.some((p) => p.status === "CLOSED"),
        funds: funds.map((f) => ({ id: f.id, name: f.name, isActive: f.isActive, balancePaisa: f.balancePaisa })),
        houseFundPaisa: funds.filter((f) => f.isActive).reduce((sum, f) => sum + f.balancePaisa, 0),
        linkableUsers: users,
        periodMonths: monthsAsc,
        perms,
        advanceLimitPaisa,
        complaints,
      }}
    />
  );
}
