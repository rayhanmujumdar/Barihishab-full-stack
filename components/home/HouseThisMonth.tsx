import { ArrowRightIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { distributionHref, entriesHref } from "@/components/distribution/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { translator, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import type { HomeMonthDto, HouseDto } from "./types";

function Cell({ label, op, value }: { label: string; op?: string; value: string }) {
  return (
    <>
      <span className="stair-label">
        <span className="kicker">{label}</span>
        {op ? (
          <span className="stair-op" aria-hidden>
            {op}
          </span>
        ) : null}
      </span>
      <span className="stat-value">{value}</span>
    </>
  );
}

/** The Distribution staircase for the Home month, Draft while open (F7, Rule 4). */
export function HouseThisMonth({ locale, house: h, month }: { locale: Locale; house: HouseDto; month: HomeMonthDto }) {
  const tr = translator(locale);
  const money = (p: number) => formatMoney(locale, p);
  return (
    <section aria-labelledby="house-title">
      {/* The staircase's own 2px top rule closes this header (no double rule). */}
      <div className="section-head section-head-flush flex-wrap">
        <h2 id="house-title" className="flex shrink-0 items-center gap-2">
          {tr("home.house.title")}
          {h.draft ? <Badge variant="accent">{tr("home.house.draft")}</Badge> : null}
        </h2>
        <Button asChild variant="ghost" className="pr-0">
          <Link href={distributionHref(locale, month.key)}>
            {tr("home.house.shares")}
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      </div>
      <div className="stair">
        <Link className="stair-cell" href={entriesHref(locale, month.key, "INCOME")}>
          <Cell label={tr("dist.income")} value={money(h.incomePaisa)} />
        </Link>
        <Link className="stair-cell" href={entriesHref(locale, month.key, "EXPENSE")}>
          <Cell label={tr("dist.expense")} op="−" value={money(h.expensePaisa)} />
        </Link>
        <Link className="stair-cell" href={distributionHref(locale, month.key)}>
          <Cell label={tr("dist.reserve")} op="−" value={money(h.reservePaisa)} />
        </Link>
        <Link className="stair-cell" href={distributionHref(locale, month.key)}>
          <Cell label={tr("dist.prevDeficit")} op="−" value={money(h.previousDeficitPaisa)} />
        </Link>
        <Link className="stair-cell stair-total" href={distributionHref(locale, month.key)} data-testid="home-distributable">
          <Cell label={tr("dist.distributable")} op="=" value={money(h.distributablePaisa)} />
        </Link>
      </div>
      {h.shortfallPaisa > 0 ? <p className="bal-neg mt-3 mb-0 font-semibold">{tr("home.house.shortfall", { amount: money(h.shortfallPaisa) })}</p> : null}
    </section>
  );
}
