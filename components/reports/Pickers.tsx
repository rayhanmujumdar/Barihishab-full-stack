"use client";

// Period pickers for the Reports tabs (F1, G3): the URL holds the period.
import { ChevronLeftIcon, ChevronRightIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId } from "react";
import { Badge } from "@/components/ui/badge";
import { translator, type Locale } from "@/lib/i18n";
import { monthLabel } from "@/lib/periods/month";
import { num, reportHref, type ReportTab } from "./format";

type Month = { key: string; status: "OPEN" | "CLOSED" };

/** Newest-first months with prev / next steps and a jump list. */
export function MonthPicker({ locale, tab, months, current, param = "month" }: { locale: Locale; tab: ReportTab; months: Month[]; current: string; param?: string }) {
  const tr = translator(locale);
  const router = useRouter();
  const id = useId();
  const href = (key: string) => reportHref(locale, tab, { [param]: key });
  const i = months.findIndex((m) => m.key === current);
  const newer = i > 0 ? months[i - 1] : null;
  const older = i >= 0 && i < months.length - 1 ? months[i + 1] : null;
  const closed = months[i]?.status === "CLOSED";
  return (
    <>
      <nav className="month-picker" aria-label={tr("rpt.pickMonth")}>
        {older ? (
          <Link href={href(older.key)} aria-label={tr("rpt.prevMonth")}>
            <ChevronLeftIcon className="size-5" />
          </Link>
        ) : (
          <span aria-disabled="true">
            <ChevronLeftIcon className="size-5" />
          </span>
        )}
        <span className="month-picker-label">
          {closed ? <LockClosedIcon className="size-4" aria-hidden /> : null}
          {monthLabel(locale, current)}
          {!closed && i >= 0 ? <Badge variant="accent">{tr("rpt.draft")}</Badge> : null}
        </span>
        {newer ? (
          <Link href={href(newer.key)} aria-label={tr("rpt.nextMonth")}>
            <ChevronRightIcon className="size-5" />
          </Link>
        ) : (
          <span aria-disabled="true">
            <ChevronRightIcon className="size-5" />
          </span>
        )}
      </nav>
      <label className="sr-only" htmlFor={id}>
        {tr("rpt.pickMonth")}
      </label>
      <select id={id} className="input min-h-11 border border-[var(--color-divider)] bg-[var(--color-surface)] px-3" value={current} onChange={(e) => router.push(href(e.target.value))}>
        {months.map((m) => (
          <option key={m.key} value={m.key}>
            {monthLabel(locale, m.key)} · {tr(m.status === "CLOSED" ? "rpt.final" : "rpt.draft")}
          </option>
        ))}
      </select>
    </>
  );
}

/** Only years that have data (G3). */
export function YearPicker({ locale, tab, years, current }: { locale: Locale; tab: ReportTab; years: number[]; current: number }) {
  const tr = translator(locale);
  const router = useRouter();
  const id = useId();
  const list = years.includes(current) ? years : [current, ...years];
  return (
    <span className="flex items-center gap-2">
      <label className="kicker" htmlFor={id}>
        {tr("rpt.pickYear")}
      </label>
      <select id={id} className="input min-h-11 border border-[var(--color-divider)] bg-[var(--color-surface)] px-3 font-extrabold" value={current} onChange={(e) => router.push(reportHref(locale, tab, { year: e.target.value }))}>
        {list.map((y) => (
          <option key={y} value={y}>
            {num(locale, y)}
          </option>
        ))}
      </select>
    </span>
  );
}
