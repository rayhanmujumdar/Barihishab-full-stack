import type { Metadata } from "next";
import { Suspense } from "react";
import { Forbidden } from "@/components/app/Forbidden";
import { AdvancesLoansView } from "@/components/loans/AdvancesLoansView";
import type { LoanStatus, Tab } from "@/components/loans/types";
import { requirePagePermission } from "@/lib/auth/server";
import { todayIsoInDhaka } from "@/lib/clock";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { listAdvances, standingByOwner } from "@/lib/loans/advance-service";
import { earliestOpenMonth, listLoans, loanDetail, loanSummary } from "@/lib/loans/loan-read";
import { activeLoans } from "@/lib/loans/loan-service";
import { listFunds } from "@/lib/master-data/fund-service";
import { isUuid } from "@/lib/api/params";
import { ensureCurrentPeriod } from "@/lib/periods/period-service";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { currentPropertyId } from "@/lib/property";

type Search = Promise<Record<string, string | string[] | undefined>>;

const TABS: Tab[] = ["loans", "advances", "owners"];
const STATUSES: LoanStatus[] = ["ACTIVE", "REPAID", "WRITTEN_OFF", "CANCELLED"];
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "meta.advances") };
}

/** Advances & loans (Advances & Loans PRD F1–F3, F11–F13; main PRD S7 `/advances`). */
export default async function AdvancesPage({ searchParams }: { searchParams: Search }) {
  const locale = await getLocale();
  return (
    <Suspense fallback={<p className="muted">{t(locale, "common.loading")}</p>}>
      <Advances searchParams={searchParams} />
    </Suspense>
  );
}

async function Advances({ searchParams }: { searchParams: Search }) {
  const locale = await getLocale();
  const viewer = await requirePagePermission("loan.view");
  if (!viewer) return <Forbidden locale={locale} />;
  const sp = await searchParams;
  const tab = (TABS as string[]).includes(one(sp.tab) ?? "") ? (one(sp.tab) as Tab) : "loans";
  const owner = isUuid(one(sp.owner)) ? one(sp.owner)! : "";
  const status = (STATUSES as string[]).includes(one(sp.status) ?? "") ? (one(sp.status) as LoanStatus) : "";
  const y = Number(one(sp.year));
  const year = Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : Number(todayIsoInDhaka().slice(0, 4));
  const loanId = one(sp.loan);

  const propertyId = await currentPropertyId();
  await ensureCurrentPeriod(propertyId);
  const perms = {
    createLoan: can(viewer, "loan.create"),
    advance: can(viewer, "advance.create"),
    repay: can(viewer, "loan.repay"),
    manage: can(viewer, "loan.manage"),
  };
  const writer = perms.createLoan || perms.advance || perms.repay;
  // Sequential reads keep the pool small; each is a handful of queries on one house.
  // Full cards (with histories) only for the Loans tab; the tiles need just the active loans.
  const loans =
    tab === "loans"
      ? await listLoans(propertyId, { ownerId: owner || undefined, status: status || undefined })
      : { loans: [], summary: loanSummary(await activeLoans(prisma, propertyId)) };
  const advances = await listAdvances(propertyId, { ownerId: tab === "advances" ? owner || undefined : undefined, year });
  const standing = await standingByOwner(propertyId);
  const detail = isUuid(loanId) ? await loanDetail(propertyId, loanId) : null;
  const funds = writer ? (await listFunds(propertyId)).filter((f) => f.isActive) : [];
  const openMonth = await earliestOpenMonth(prisma, propertyId);

  return (
    <AdvancesLoansView
      locale={locale}
      data={{
        tab,
        filters: { owner, status, year },
        summary: { ...loans.summary, ...advances.summary },
        loans: loans.loans,
        advances: tab === "advances" ? advances.advances : [],
        standing: standing.owners,
        multiplierPct: standing.multiplierPct,
        detail,
        funds: funds.map((f) => ({ id: f.id, name: f.name, balancePaisa: f.balancePaisa })),
        houseFundPaisa: funds.reduce((s, f) => s + f.balancePaisa, 0),
        openMonth,
        perms,
      }}
    />
  );
}
