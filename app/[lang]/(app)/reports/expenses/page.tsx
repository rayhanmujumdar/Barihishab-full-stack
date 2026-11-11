import type { Metadata } from "next";
import { Suspense } from "react";
import { Forbidden } from "@/components/app/Forbidden";
import { ExpenseAnalysisReport } from "@/components/reports/ExpenseAnalysisReport";
import { ReportsHeader } from "@/components/reports/ReportsHeader";
import { ReportsSkeleton } from "@/components/skeletons/pages";
import { requirePagePermission } from "@/lib/auth/server";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { currentMonthKey } from "@/lib/periods/month";
import { prisma } from "@/lib/prisma";
import { currentPropertyId } from "@/lib/property";
import { expenseAnalysis } from "@/lib/reports/expenses";
import { defaultMonth, loadPeriods } from "@/lib/reports/month-figures";
import { many, monthParam, type Search } from "@/lib/reports/page-params";
import { ExpensesQuerySchema } from "@/lib/reports/params";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "meta.reports") };
}

type Props = { searchParams: Promise<Search> };

/** Expense analysis (Reports PRD F10): `?from=&to=&category=`. */
export default async function ExpensesPage({ searchParams }: Props) {
  const locale = await getLocale();
  return (
    <Suspense fallback={<ReportsSkeleton locale={locale} />}>
      <Expenses searchParams={searchParams} />
    </Suspense>
  );
}

async function Expenses({ searchParams }: Props) {
  const locale = await getLocale();
  const viewer = await requirePagePermission("report.view");
  if (!viewer) return <Forbidden locale={locale} />;
  const propertyId = await currentPropertyId();
  const sp = await searchParams;
  const year = (defaultMonth(await loadPeriods(prisma, propertyId)) ?? currentMonthKey()).slice(0, 4);
  const asked = ExpensesQuerySchema.safeParse({ from: monthParam(sp, "from") ?? `${year}-01`, to: monthParam(sp, "to") ?? `${year}-12`, categoryId: many(sp.category) });
  const q = asked.success ? asked.data : { from: `${year}-01`, to: `${year}-12`, categoryId: [] };
  const data = await expenseAnalysis(propertyId, q.from, q.to, q.categoryId);
  return (
    <div className="page-stack">
      <ReportsHeader locale={locale} tab="expenses" houseName={data.house.name} />
      <ExpenseAnalysisReport key={`${q.from}-${q.to}-${q.categoryId.join(",")}`} locale={locale} data={data} />
    </div>
  );
}
