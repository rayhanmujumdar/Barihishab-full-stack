import type { Metadata } from "next";
import { Suspense } from "react";
import { Forbidden } from "@/components/app/Forbidden";
import { csvHref, printHref } from "@/components/reports/format";
import { YearPicker } from "@/components/reports/Pickers";
import { ReportsHeader } from "@/components/reports/ReportsHeader";
import { YearlyReport } from "@/components/reports/YearlyReport";
import { ReportsSkeleton } from "@/components/skeletons/pages";
import { requirePagePermission } from "@/lib/auth/server";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { currentPropertyId } from "@/lib/property";
import { yearParam, type Search } from "@/lib/reports/page-params";
import { yearlyReport } from "@/lib/reports/yearly";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "meta.reports") };
}

type Props = { searchParams: Promise<Search> };

/** Yearly report (Reports PRD F3; S9 `/reports/yearly?year=`). */
export default async function YearlyPage({ searchParams }: Props) {
  const locale = await getLocale();
  return (
    <Suspense fallback={<ReportsSkeleton locale={locale} />}>
      <Yearly searchParams={searchParams} />
    </Suspense>
  );
}

async function Yearly({ searchParams }: Props) {
  const locale = await getLocale();
  const viewer = await requirePagePermission("report.view");
  if (!viewer) return <Forbidden locale={locale} />;
  const data = await yearlyReport(await currentPropertyId(), yearParam(await searchParams));
  const year = data.year;
  return (
    <div className="page-stack">
      <ReportsHeader
        locale={locale}
        tab="yearly"
        houseName={data.house.name}
        actions={data.empty ? {} : { print: printHref(locale, "yearly", { year }), pdf: printHref(locale, "yearly", { year, pdf: 1 }), csv: csvHref("yearly", { year }) }}
      >
        <YearPicker locale={locale} tab="yearly" years={data.years} current={year} />
      </ReportsHeader>
      <YearlyReport locale={locale} data={data} />
    </div>
  );
}
