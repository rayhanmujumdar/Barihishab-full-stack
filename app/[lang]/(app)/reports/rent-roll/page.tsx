import type { Metadata } from "next";
import { Suspense } from "react";
import { Forbidden } from "@/components/app/Forbidden";
import { YearPicker } from "@/components/reports/Pickers";
import { RentRollReport } from "@/components/reports/RentRollReport";
import { ReportsHeader } from "@/components/reports/ReportsHeader";
import { ReportsSkeleton } from "@/components/skeletons/pages";
import { requirePagePermission } from "@/lib/auth/server";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { currentPropertyId } from "@/lib/property";
import { yearParam, type Search } from "@/lib/reports/page-params";
import { rentRollReport } from "@/lib/reports/rent-roll";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "meta.reports") };
}

type Props = { searchParams: Promise<Search> };

/** Rent roll (Reports PRD F9). */
export default async function RentRollPage({ searchParams }: Props) {
  const locale = await getLocale();
  return (
    <Suspense fallback={<ReportsSkeleton locale={locale} />}>
      <RentRoll searchParams={searchParams} />
    </Suspense>
  );
}

async function RentRoll({ searchParams }: Props) {
  const locale = await getLocale();
  const viewer = await requirePagePermission("report.view");
  if (!viewer) return <Forbidden locale={locale} />;
  const data = await rentRollReport(await currentPropertyId(), yearParam(await searchParams));
  return (
    <div className="page-stack">
      <ReportsHeader locale={locale} tab="rent-roll" houseName={data.house.name}>
        <YearPicker locale={locale} tab="rent-roll" years={data.years} current={data.year} />
      </ReportsHeader>
      <RentRollReport locale={locale} data={data} />
    </div>
  );
}
