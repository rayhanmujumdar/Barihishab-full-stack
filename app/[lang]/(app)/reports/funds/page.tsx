import type { Metadata } from "next";
import { Suspense } from "react";
import { Forbidden } from "@/components/app/Forbidden";
import { FundsReport } from "@/components/reports/FundsReport";
import { MonthPicker, YearPicker } from "@/components/reports/Pickers";
import { ReportsHeader } from "@/components/reports/ReportsHeader";
import { ReportsSkeleton } from "@/components/skeletons/pages";
import { requirePagePermission } from "@/lib/auth/server";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { currentMonthKey } from "@/lib/periods/month";
import { prisma } from "@/lib/prisma";
import { currentPropertyId } from "@/lib/property";
import { fundsReport } from "@/lib/reports/funds";
import { defaultMonth, loadPeriods } from "@/lib/reports/month-figures";
import { monthParam, yearParam, type Search } from "@/lib/reports/page-params";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "meta.reports") };
}

type Props = { searchParams: Promise<Search> };

/** Fund accounts report (Reports PRD F11): `?month=` or `?year=`. */
export default async function FundsPage({ searchParams }: Props) {
  const locale = await getLocale();
  return (
    <Suspense fallback={<ReportsSkeleton locale={locale} />}>
      <Funds searchParams={searchParams} />
    </Suspense>
  );
}

async function Funds({ searchParams }: Props) {
  const locale = await getLocale();
  const viewer = await requirePagePermission("report.view");
  if (!viewer) return <Forbidden locale={locale} />;
  const propertyId = await currentPropertyId();
  const sp = await searchParams;
  const periods = await loadPeriods(prisma, propertyId);
  const asked = monthParam(sp);
  const year = asked ? null : yearParam(sp);
  // A month without a period (or none asked) falls back to the default month (reports-ui).
  const month = year === null ? ((asked && periods.some((p) => p.key === asked) ? asked : null) ?? defaultMonth(periods) ?? currentMonthKey()) : null;
  const data = await fundsReport(propertyId, month ? { kind: "month", month } : { kind: "year", year: year! });
  return (
    <div className="page-stack">
      <ReportsHeader locale={locale} tab="funds" houseName={data.house.name}>
        {month ? (
          data.months.length ? <MonthPicker locale={locale} tab="funds" months={data.months} current={month} /> : null
        ) : (
          <YearPicker locale={locale} tab="funds" years={data.years} current={year!} />
        )}
      </ReportsHeader>
      <FundsReport locale={locale} data={data} />
    </div>
  );
}
