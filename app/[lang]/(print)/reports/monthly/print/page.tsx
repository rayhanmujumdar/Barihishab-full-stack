import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Forbidden } from "@/components/app/Forbidden";
import { AutoPrint } from "@/components/owners/AutoPrint";
import { reportDocTitle } from "@/components/reports/format";
import { MonthlyReport } from "@/components/reports/MonthlyReport";
import { PrintFrame } from "@/components/reports/PrintFrame";
import { ReportPrintSkeleton } from "@/components/skeletons/pages";
import { requirePagePermission } from "@/lib/auth/server";
import { now } from "@/lib/clock";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { monthLabel } from "@/lib/periods/month";
import { currentPropertyId } from "@/lib/property";
import { monthlyReport } from "@/lib/reports/monthly";
import { monthParam, one, type Search } from "@/lib/reports/page-params";
import { viewerName } from "@/lib/reports/print-viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "meta.reports") };
}

type Props = { searchParams: Promise<Search> };

/** Monthly report print view → Print or browser "Save as PDF" (Reports PRD F5, F6). No app chrome. */
export default async function MonthlyPrintPage(props: Props) {
  const locale = await getLocale();
  return (
    <main className="print-page rpt-print-page">
      <Suspense fallback={<ReportPrintSkeleton locale={locale} />}>
        <Print {...props} />
      </Suspense>
    </main>
  );
}

async function Print({ searchParams }: Props) {
  const locale = await getLocale();
  const viewer = await requirePagePermission("report.view");
  if (!viewer) return <Forbidden locale={locale} />;
  const sp = await searchParams;
  const propertyId = await currentPropertyId();
  const asked = monthParam(sp);
  const data = (asked ? await monthlyReport(propertyId, asked) : undefined) ?? (await monthlyReport(propertyId, null));
  if (!data || data.month === null) notFound();
  return (
    <>
      <AutoPrint title={reportDocTitle("monthly", data)} label={t(locale, "rpt.print")} />
      <PrintFrame
        locale={locale}
        house={data.house}
        title={t(locale, "rpt.monthlyTitle", { month: monthLabel(locale, data.month.key) })}
        draft={data.month.status === "DRAFT"}
        generatedBy={viewerName(viewer)}
        generatedAt={now().toISOString()}
        pdf={one(sp.pdf) === "1"}
      >
        <MonthlyReport locale={locale} data={data} mode="print" />
      </PrintFrame>
    </>
  );
}
