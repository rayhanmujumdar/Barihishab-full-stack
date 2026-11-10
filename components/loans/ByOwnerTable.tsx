"use client";

import Link from "next/link";
import { ownerHref } from "@/components/owners/format";
import { translator, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { pctText, shortDate } from "./format";
import type { StandingDto } from "./types";

/** By owner (F13): loans, advance outstanding and limit use; tap → owner page. */
export function ByOwnerTable({ locale, rows }: { locale: Locale; rows: StandingDto[] }) {
  const tr = translator(locale);
  return (
    <section aria-label={tr("al.own.list")}>
      <ul className="m-0 list-none border-t-2 border-foreground p-0">
        {rows.map((o) => (
          <li key={o.ownerId}>
            <Link href={ownerHref(locale, o.ownerId)} className="grid gap-2 border-b border-[var(--color-divider)] py-3 text-foreground no-underline hover:bg-[var(--color-neutral-200)] sm:grid-cols-6">
              <span className="font-bold">{o.displayName}</span>
              <span>
                <span className="kicker block">{tr("al.own.col.loan")}</span>
                {o.activeLoans ? tr("al.own.loanCount", { amount: formatMoney(locale, o.loanOutstandingPaisa), n: o.activeLoans }) : tr("owners.loan.none")}
              </span>
              <span>
                <span className="kicker block">{tr("al.own.col.advance")}</span>
                <span className={o.advanceOutstandingPaisa ? "bal-neg" : undefined}>{formatMoney(locale, o.advanceOutstandingPaisa)}</span>
              </span>
              <span>
                <span className="kicker block">{tr("al.own.col.limit")}</span>
                {o.limitPaisa === null ? tr("al.own.noLimit") : formatMoney(locale, o.limitPaisa)}
              </span>
              <span>
                <span className="kicker block">{tr("al.own.col.used")}</span>
                {o.limitUsedPct === null ? tr("al.none") : pctText(locale, o.limitUsedPct)}
              </span>
              <span>
                <span className="kicker block">{tr("al.own.col.last")}</span>
                {o.lastAdvanceDate ? shortDate(locale, o.lastAdvanceDate) : tr("al.none")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
