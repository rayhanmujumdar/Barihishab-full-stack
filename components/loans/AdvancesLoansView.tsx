"use client";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SelectField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { translator, type Locale, type MessageKey } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { AdvancesTable } from "./AdvancesTable";
import { ByOwnerTable } from "./ByOwnerTable";
import { num } from "@/components/owners/format";
import { advancesHref } from "./format";
import { InstalmentDialog } from "./InstalmentDialog";
import { LoanActionDialog, type LoanAction } from "./LoanActionDialog";
import { LoanCard } from "./LoanCard";
import { LoanDetailSheet } from "./LoanDetailSheet";
import { LoanDrawer } from "./LoanDrawer";
import { RepaymentDialog } from "./RepaymentDialog";
import type { AdvancesLoansData, HistoryRow, LoanCardDto, LoanStatus, Tab } from "./types";

export type Open =
  | { kind: "loan" | "advance" }
  | { kind: "repay" | "instalment" | "cancel" | "writeoff"; loan: LoanCardDto }
  | { kind: "void"; loan: LoanCardDto; row: HistoryRow }
  | null;

const TABS: Tab[] = ["loans", "advances", "owners"];
const STATUSES: LoanStatus[] = ["ACTIVE", "REPAID", "WRITTEN_OFF", "CANCELLED"];

/** Advances & loans screen (Advances & Loans PRD F1, F2, F11, F13). */
export function AdvancesLoansView({ locale, data }: { locale: Locale; data: AdvancesLoansData }) {
  const tr = translator(locale);
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const { tab, filters, summary, perms } = data;
  const base = { tab, owner: filters.owner, status: filters.status, year: filters.year };
  const go = (q: Partial<typeof base> & { loan?: string | null }) => router.replace(advancesHref(locale, { ...base, ...q }), { scroll: false });
  const done = () => {
    setOpen(null);
    router.refresh();
  };
  const years = [...new Set([filters.year, ...summary.years])].sort((a, b) => b - a);
  const ownerOptions = [{ value: "", label: tr("al.filter.allOwners") }, ...data.standing.map((o) => ({ value: o.ownerId, label: o.displayName }))];

  return (
    <div className="page-stack" lang={locale}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">{tr("al.kicker")}</p>
          <h1 className="page-title">{tr("al.title")}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {perms.advance ? (
            <Button variant="outline" onClick={() => setOpen({ kind: "advance" })}>
              <PlusIcon data-icon="inline-start" />
              {tr("al.newAdvance")}
            </Button>
          ) : null}
          {perms.createLoan ? (
            <Button onClick={() => setOpen({ kind: "loan" })}>
              <PlusIcon data-icon="inline-start" />
              {tr("al.newLoan")}
            </Button>
          ) : null}
        </div>
      </div>

      <section aria-label={tr("al.summary")} className="stats">
        <div className="stat">
          <p className="kicker">{tr("al.tile.loansOutstanding")}</p>
          <div className="stat-value">{formatMoney(locale, summary.loansOutstandingPaisa)}</div>
        </div>
        <div className="stat">
          <p className="kicker">{tr("al.tile.activeLoans")}</p>
          <div className="stat-value">{num(locale, summary.activeLoans)}</div>
        </div>
        <div className="stat">
          <p className="kicker">{tr("al.tile.advancesOutstanding")}</p>
          <div className={cn("stat-value", summary.advancesOutstandingPaisa > 0 && "bal-neg")}>{formatMoney(locale, summary.advancesOutstandingPaisa)}</div>
        </div>
        <div className="stat">
          <div className="flex items-center justify-between gap-2">
            <p className="kicker">{tr("al.tile.advancesPaid", { year: num(locale, summary.year) })}</p>
            <NativeSelect aria-label={tr("al.year")} value={String(filters.year)} onChange={(e) => go({ year: Number(e.target.value) })} className="h-8 w-auto">
              {years.map((y) => (
                <NativeSelectOption key={y} value={String(y)}>
                  {num(locale, y)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="stat-value">{formatMoney(locale, summary.paidInYearPaisa)}</div>
        </div>
      </section>

      <nav aria-label={tr("al.tabs")} className="flex gap-1 border-b-2 border-foreground">
        {TABS.map((tb) => (
          <Link
            key={tb}
            href={advancesHref(locale, { tab: tb, owner: filters.owner, year: filters.year })}
            aria-current={tab === tb ? "page" : undefined}
            className={cn("px-3 py-2 font-semibold text-foreground no-underline", tab === tb ? "bg-[var(--signal)]" : "hover:bg-[var(--color-neutral-200)]")}
          >
            {tr(`al.tab.${tb}` as MessageKey)}
          </Link>
        ))}
      </nav>

      {tab !== "owners" ? (
        <div className="grid-2">
          <SelectField id="al-owner" label={tr("al.filter.owner")} value={filters.owner} onChange={(e) => go({ owner: e.target.value })} options={ownerOptions} />
          {/* The year lives on the "Advances paid" tile: one Year control drives the tile and the list. */}
          {tab === "loans" ? (
            <SelectField
              id="al-status"
              label={tr("al.filter.status")}
              value={filters.status}
              onChange={(e) => go({ status: e.target.value as LoanStatus | "" })}
              options={[{ value: "", label: tr("al.filter.all") }, ...STATUSES.map((s) => ({ value: s, label: tr(`al.status.${s}` as MessageKey) }))]}
            />
          ) : null}
        </div>
      ) : null}

      {tab === "loans" ? (
        data.loans.length ? (
          <ul className="m-0 flex list-none flex-col gap-4 p-0" aria-label={tr("al.tab.loans")}>
            {data.loans.map((l) => (
              <li key={l.id}>
                <LoanCard locale={locale} loan={l} perms={perms} onSeeAll={() => go({ loan: l.id })} onAction={setOpen} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-start gap-3 border-t-2 border-foreground pt-4">
            <p className="m-0">{filters.owner || filters.status ? tr("al.empty.filtered") : tr("al.empty.loans")}</p>
            {perms.createLoan && !filters.owner && !filters.status ? (
              <Button onClick={() => setOpen({ kind: "loan" })}>
                <PlusIcon data-icon="inline-start" />
                {tr("al.newLoan")}
              </Button>
            ) : null}
          </div>
        )
      ) : null}
      {tab === "advances" ? <AdvancesTable locale={locale} rows={data.advances} multiplierPct={data.multiplierPct} /> : null}
      {tab === "owners" ? <ByOwnerTable locale={locale} rows={data.standing} /> : null}

      {data.detail ? (
        <LoanDetailSheet locale={locale} detail={data.detail} perms={perms} complaints={data.complaints} onClose={() => go({ loan: null })} onAction={setOpen} />
      ) : null}

      {open?.kind === "loan" || open?.kind === "advance" ? (
        <LoanDrawer locale={locale} mode={open.kind} data={data} onClose={() => setOpen(null)} onSaved={done} />
      ) : null}
      {open?.kind === "repay" ? (
        <RepaymentDialog locale={locale} loan={open.loan} standing={data.standing.find((s) => s.ownerId === open.loan.ownerId) ?? null} funds={data.funds} onClose={() => setOpen(null)} onDone={done} />
      ) : null}
      {open?.kind === "instalment" ? <InstalmentDialog locale={locale} loan={open.loan} openMonth={data.openMonth} onClose={() => setOpen(null)} onDone={done} /> : null}
      {open && (open.kind === "cancel" || open.kind === "writeoff" || open.kind === "void") ? (
        <LoanActionDialog
          locale={locale}
          action={(open.kind === "void" ? { kind: "void", loan: open.loan, row: open.row } : { kind: open.kind, loan: open.loan }) as LoanAction}
          onClose={() => setOpen(null)}
          onDone={done}
        />
      ) : null}
    </div>
  );
}
