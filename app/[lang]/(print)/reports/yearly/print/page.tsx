import type { Metadata } from "next";
import { Suspense } from "react";
import { Forbidden } from "@/components/app/Forbidden";
import { AutoPrint } from "@/components/owners/AutoPrint";
import { num, reportDocTitle } from "@/components/reports/format";
import { PrintFrame } from "@/components/reports/PrintFrame";
import { YearlyReport } from "@/components/reports/YearlyReport";
import { ReportPrintSkeleton } from "@/components/skeletons/pages";
import { requirePagePermission } from "@/lib/auth/server";
import { now } from "@/lib/clock";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { currentPropertyId } from "@/lib/property";
import { one, yearParam, type Search } from "@/lib/reports/page-params";
import { viewerName } from "@/lib/reports/print-viewer";
import { yearlyReport } from "@/lib/reports/yearly";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "meta.reports") };
}

type Props = { searchParams: Promise<Search> };

/** Yearly report print view → Print or browser "Save as PDF" (Reports PRD F5, F6). */
export default async function YearlyPrintPage(props: Props) {
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
  const data = await yearlyReport(await currentPropertyId(), yearParam(sp));
  return (
    <>
      <AutoPrint title={reportDocTitle("yearly", data)} label={t(locale, "rpt.print")} />
      <PrintFrame
        locale={locale}
        house={data.house}
        title={t(locale, "rpt.yearlyTitle", { year: num(locale, data.year) })}
        draft={data.totals.draftCount > 0}
        generatedBy={viewerName(viewer)}
        generatedAt={now().toISOString()}
        pdf={one(sp.pdf) === "1"}
      >
        <YearlyReport locale={locale} data={data} mode="print" />
      </PrintFrame>
    </>
  );
}
