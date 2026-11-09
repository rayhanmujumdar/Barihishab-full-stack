import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Forbidden } from "@/components/app/Forbidden";
import { DistributionView } from "@/components/distribution/DistributionView";
import { requirePagePermission } from "@/lib/auth/server";
import { getDistribution } from "@/lib/distribution/distribution-service";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { listFunds } from "@/lib/master-data/fund-service";
import { isMonthKey } from "@/lib/periods/month";
import { ensureCurrentPeriod } from "@/lib/periods/period-service";
import { can } from "@/lib/permissions";
import { currentPropertyId } from "@/lib/property";

type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "meta.distribution") };
}

/** Distribution board (Distribution PRD F1–F5, F7–F9, F12, F15; S5 `/distribution?month=`). */
export default async function DistributionPage({ searchParams }: { searchParams: Search }) {
  const locale = await getLocale();
  return (
    <Suspense fallback={<p className="muted">{t(locale, "common.loading")}</p>}>
      <Distribution searchParams={searchParams} />
    </Suspense>
  );
}

async function Distribution({ searchParams }: { searchParams: Search }) {
  const locale = await getLocale();
  const viewer = await requirePagePermission("distribution.view");
  if (!viewer) return <Forbidden locale={locale} />;
  const raw = (await searchParams).month;
  const asked = Array.isArray(raw) ? raw[0] : raw;
  const month = asked && isMonthKey(asked) ? asked : null;
  const propertyId = await currentPropertyId();
  await ensureCurrentPeriod(propertyId);
  const perms = {
    close: can(viewer, "period.close"),
    reopen: can(viewer, "period.reopen"),
    override: can(viewer, "reserve.override"),
    pay: can(viewer, "payout.create"),
    shares: can(viewer, "share.manage"),
  };
  const [data, funds] = await Promise.all([getDistribution(propertyId, month, viewer.id), perms.pay ? listFunds(propertyId) : Promise.resolve([])]);
  if (!data) notFound();
  const activeFunds = funds.filter((f) => f.isActive);
  return (
    <DistributionView
      locale={locale}
      data={data}
      perms={perms}
      funds={funds.map((f) => ({ id: f.id, name: f.name, isActive: f.isActive, balancePaisa: f.balancePaisa }))}
      houseFundPaisa={activeFunds.reduce((sum, f) => sum + f.balancePaisa, 0)}
    />
  );
}
