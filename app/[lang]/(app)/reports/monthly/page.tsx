import type { Metadata } from "next";
import { Suspense } from "react";
import { Forbidden } from "@/components/app/Forbidden";
import { csvHref, printHref } from "@/components/reports/format";
import { MonthlyReport } from "@/components/reports/MonthlyReport";
import { MonthPicker } from "@/components/reports/Pickers";
import { ReportsHeader } from "@/components/reports/ReportsHeader";
import { ReportsSkeleton } from "@/components/skeletons/pages";
import { requirePagePermission } from "@/lib/auth/server";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { currentPropertyId } from "@/lib/property";
import { loadHouse } from "@/lib/reports/month-figures";
import { monthlyReport } from "@/lib/reports/monthly";
import { monthParam, type Search } from "@/lib/reports/page-params";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "meta.reports") };
}

type Props = { searchParams: Promise<Search> };

/** Monthly report (Reports PRD F1, F2; S9 `/reports/monthly?month=`). */
export default async function MonthlyPage({ searchParams }: Props) {
  const locale = await getLocale();
  return (
    <Suspense fallback={<ReportsSkeleton locale={locale} />}>
      <Monthly searchParams={searchParams} />
    </Suspense>
  );
}

async function Monthly({ searchParams }: Props) {
  const locale = await getLocale();
  const viewer = await requirePagePermission("report.view");
  if (!viewer) return <Forbidden locale={locale} />;
  const propertyId = await currentPropertyId();
  const asked = monthParam(await searchParams);
  // An unknown month falls back to the default (latest closed) month.
  const data = (asked ? await monthlyReport(propertyId, asked) : undefined) ?? (await monthlyReport(propertyId, null));
  if (!data || data.month === null) {
    const house = await loadHouse(propertyId);
    return (
      <div className="page-stack">
        <ReportsHeader locale={locale} tab="monthly" houseName={house.name} />
        <p className="rpt-empty">{t(locale, "rpt.noMonths")}</p>
      </div>
    );
  }
  const month = data.month.key;
  return (
    <div className="page-stack">
      <ReportsHeader
        locale={locale}
        tab="monthly"
        houseName={data.house.name}
        actions={{ print: printHref(locale, "monthly", { month }), pdf: printHref(locale, "monthly", { month, pdf: 1 }), csv: csvHref("monthly", { month }) }}
      >
        <MonthPicker locale={locale} tab="monthly" months={data.months} current={month} />
      </ReportsHeader>
      <MonthlyReport locale={locale} data={data} />
    </div>
  );
}
