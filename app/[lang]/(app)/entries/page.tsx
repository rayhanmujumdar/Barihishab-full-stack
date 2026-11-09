import type { Metadata } from "next";
import { Suspense } from "react";
import { Forbidden } from "@/components/app/Forbidden";
import { EntriesSkeleton } from "@/components/entries/EntriesSkeleton";
import { EntriesView } from "@/components/entries/EntriesView";
import type { EntriesData, Kind } from "@/components/entries/types";
import { requirePagePermission } from "@/lib/auth/server";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { listCategories } from "@/lib/master-data/category-service";
import { listFunds } from "@/lib/master-data/fund-service";
import { listUnits } from "@/lib/master-data/unit-service";
import { isMonthKey } from "@/lib/periods/month";
import { ensureCurrentPeriod, listPeriods } from "@/lib/periods/period-service";
import { can } from "@/lib/permissions";
import { currentPropertyId } from "@/lib/property";
import { listTransactions, periodSummary } from "@/lib/transactions/transaction-service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "meta.entries") };
}

type Search = Promise<Record<string, string | string[] | undefined>>;

/** S3 — Income & expenses (Income & Expenses PRD §6.1). `?period=&type=&category=` drive the view. */
export default async function EntriesPage({ searchParams }: { searchParams: Search }) {
  const locale = await getLocale();
  return (
    <Suspense fallback={<EntriesSkeleton label={t(locale, "entries.loading")} />}>
      <Entries searchParams={searchParams} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Entries({ searchParams }: { searchParams: Search }) {
  const locale = await getLocale();
  const viewer = await requirePagePermission("transaction.view");
  if (!viewer) return <Forbidden locale={locale} />;

  const sp = await searchParams;
  const propertyId = await currentPropertyId();
  await ensureCurrentPeriod(propertyId);
  const { items: periods, latestOpen } = await listPeriods(propertyId);

  const asked = one(sp.period);
  const month = asked && isMonthKey(asked) && periods.some((p) => p.month === asked) ? asked : (latestOpen ?? periods[0]?.month ?? asked ?? "");
  const type: Kind = one(sp.type) === "INCOME" ? "INCOME" : one(sp.type) === "EXPENSE" ? "EXPENSE" : "INCOME";
  const [summary, categories, units, funds] = await Promise.all([
    periodSummary(propertyId, month),
    listCategories(propertyId),
    listUnits(propertyId, { active: true }),
    listFunds(propertyId),
  ]);
  const askedCategory = one(sp.category);
  const category = summary.categories.some((c) => c.code === askedCategory && c.kind === type) ? askedCategory! : "ALL";
  const list = await listTransactions(propertyId, { period: month, kind: type, category, limit: 200 });

  const data: EntriesData = {
    month,
    status: summary.status,
    periods,
    latestOpen,
    type,
    category,
    totals: summary.totals,
    chips: summary.categories,
    items: list.items,
    nextCursor: list.nextCursor,
    totalPaisa: list.totalPaisa,
    categories,
    units,
    funds,
    perms: {
      create: can(viewer, "transaction.create"),
      update: can(viewer, "transaction.update"),
      void: can(viewer, "transaction.void"),
      adjust: can(viewer, "transaction.adjust"),
      superAdmin: viewer.roles.includes("SUPER_ADMIN"),
    },
  };
  return <EntriesView locale={locale} data={data} />;
}
