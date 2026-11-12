"use client";

import { useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon, DocumentArrowDownIcon, EllipsisHorizontalIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { todayIsoInDhaka } from "@/lib/clock";
import { translator, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import { cn } from "@/lib/utils";
import { balanceText, balanceTone, num, ownerHref, percent } from "./format";
import { AdjustmentDialog, VoidLedgerDialog } from "./LedgerDialogs";
import { LoanInstalmentDialog } from "./LoanInstalmentDialog";
import { OpeningDialog } from "./OpeningDialog";
import { OwnerFormDialog } from "./OwnerFormDialog";
import { PayDrawer } from "./PayDrawer";
import { StatementTable } from "./StatementTable";
import type { LoanDto } from "@/lib/loans/loan-service";
import type { LedgerEntryDto, OwnerPageData } from "./types";
import { OwnerAvatar } from "./OwnerAvatar";

type Open = { kind: "pay" | "advance" | "adjust" | "edit" | "opening" } | { kind: "void"; entry: LedgerEntryDto } | { kind: "loan"; loan: LoanDto } | null;

/** Owner detail: summary, statement, share history and Super Admin actions (F2, F3, F5, F11–F14). */
export function OwnerDetail({ locale, data }: { locale: Locale; data: OwnerPageData }) {
  const tr = translator(locale);
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const { owner, statement, perms } = data;
  const bal = balanceText(locale, owner.balanceLabel, owner.balancePaisa);
  const canMove = !!data.latestOpen;
  const thisYear = Number(todayIsoInDhaka().slice(0, 4));
  const years = Array.from({ length: Math.max(thisYear, owner.year) - 2019 }, (_, i) => Math.max(thisYear, owner.year) - i);
  const go = (q: { year?: number; from?: string; to?: string }) =>
    router.replace(ownerHref(locale, owner.id, { year: q.year ?? owner.year, from: q.from ?? statement.from, to: q.to ?? statement.to }), { scroll: false });
  const done = () => {
    setOpen(null);
    router.refresh();
  };
  const monthsDesc = [...data.months].reverse();
  const fromOptions = [...new Set([statement.from, ...data.months])].sort().reverse();
  const anyAction = perms.pay || perms.advance || perms.adjust || perms.manage;

  return (
    <div className="page-stack" lang={locale}>
      <div className="flex flex-col gap-4">
        <Button asChild variant="ghost" className="self-start pl-0">
          <Link href={`/${locale}/owners`}>
            <ArrowLeftIcon data-icon="inline-start" />
            {tr("owner.back")}
          </Link>
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-start gap-3">
            <OwnerAvatar initials={owner.initials} avatarUrl={owner.avatarUrl} className="size-12! text-base!" />
            <div>
              <p className="kicker">{owner.responsibility ? tr("owner.kicker", { responsibility: owner.responsibility }) : tr("owner.kickerPlain")}</p>
              <h1 className="page-title">{owner.displayName}</h1>
              {owner.email || owner.phone ? <p className="muted m-0">{[owner.email, owner.phone].filter(Boolean).join(" · ")}</p> : null}
            </div>
          </div>
          {anyAction ? (
            <div className="flex flex-col items-start gap-1">
              <div className="flex flex-wrap gap-2">
                {perms.advance ? (
                  <Button variant="outline" disabled={!canMove} aria-describedby={canMove ? undefined : "need-open"} onClick={() => setOpen({ kind: "advance" })}>
                    {tr("owner.advance")}
                  </Button>
                ) : null}
                {perms.pay ? (
                  <Button disabled={!canMove} aria-describedby={canMove ? undefined : "need-open"} onClick={() => setOpen({ kind: "pay" })}>
                    {tr("owner.pay")}
                    <ArrowRightIcon data-icon="inline-end" />
                  </Button>
                ) : null}
                {perms.adjust || perms.manage ? (
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" aria-label={tr("owner.more")}>
                        <EllipsisHorizontalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-52 rounded-none border-2 border-foreground">
                      {perms.adjust && canMove ? <DropdownMenuItem onSelect={() => setOpen({ kind: "adjust" })}>{tr("owner.adjust")}</DropdownMenuItem> : null}
                      {perms.manage ? <DropdownMenuItem onSelect={() => setOpen({ kind: "edit" })}>{tr("owner.edit")}</DropdownMenuItem> : null}
                      {perms.manage && !data.anyClosed ? <DropdownMenuItem onSelect={() => setOpen({ kind: "opening" })}>{tr("owner.opening")}</DropdownMenuItem> : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
              {!canMove && (perms.pay || perms.advance) ? (
                <p id="need-open" className="muted m-0">
                  {tr("owner.needOpen")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <section aria-label={tr("owner.summary")} className="flex flex-col gap-3">
        <div className="stats">
          <div className="stat">
            <p className="kicker">{tr("owner.sum.balance")}</p>
            <div className={cn("stat-value", `bal-${balanceTone(owner.balancePaisa)}`)}>{bal.amount || formatMoney(locale, 0)}</div>
            <span className={cn("bal-tag mt-1", `bal-${balanceTone(owner.balancePaisa)}`)}>{bal.word}</span>
          </div>
          <div className="stat">
            <p className="kicker">{tr("owner.sum.share")}</p>
            <div className="stat-value">{percent(locale, owner.sharePercent)}</div>
            <span className="muted">{tr("owners.tag.units", { n: owner.units })}</span>
          </div>
          <div className="stat">
            <p className="kicker">{tr("owner.sum.entitlement", { year: num(locale, owner.year) })}</p>
            <div className="stat-value">{formatMoney(locale, owner.entitlementPaisa)}</div>
          </div>
          <div className="stat">
            <p className="kicker">{tr("owner.sum.paidOut", { year: num(locale, owner.year) })}</p>
            <div className="stat-value">{formatMoney(locale, owner.paidOutPaisa)}</div>
          </div>
          <div className="stat">
            <p className="kicker">{tr("owner.sum.loan")}</p>
            <div className="stat-value">{owner.loanOutstandingPaisa ? formatMoney(locale, owner.loanOutstandingPaisa) : tr("owners.loan.none")}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start">
          <label htmlFor="owner-year" className="text-xs font-semibold text-muted-foreground">
            {tr("owner.year")}
          </label>
          <NativeSelect id="owner-year" value={String(owner.year)} onChange={(e) => go({ year: Number(e.target.value) })} className="w-28">
            {years.map((y) => (
              <NativeSelectOption key={y} value={String(y)}>
                {num(locale, y)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </section>

      <section aria-labelledby="st-title" className="flex flex-col gap-3">
        <div className="section-head">
          <h2 id="st-title">{tr("st.title")}</h2>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="st-from" className="text-xs font-semibold text-muted-foreground">
              {tr("st.from")}
            </label>
            <NativeSelect id="st-from" value={statement.from} onChange={(e) => go({ from: e.target.value })} className="w-44">
              {fromOptions.map((m) => (
                <NativeSelectOption key={m} value={m}>
                  {monthLabel(locale, m)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="st-to" className="text-xs font-semibold text-muted-foreground">
              {tr("st.to")}
            </label>
            <NativeSelect id="st-to" value={statement.to} onChange={(e) => go({ to: e.target.value })} className="w-44">
              <NativeSelectOption value="latest">{tr("st.latest")}</NativeSelectOption>
              {monthsDesc.map((m) => (
                <NativeSelectOption key={m} value={m}>
                  {monthLabel(locale, m)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <Button asChild variant="outline">
            <a href={`/${locale}/owners/${owner.id}/statement/print?from=${statement.from}&to=${statement.to}`} target="_blank" rel="noopener">
              <DocumentArrowDownIcon data-icon="inline-start" />
              {tr("st.pdf")}
            </a>
          </Button>
        </div>
        <StatementTable locale={locale} statement={statement} complaints={data.complaints} onVoid={perms.void && canMove ? (entry) => setOpen({ kind: "void", entry }) : undefined} />
      </section>

      {owner.loans.length ? (
        <section aria-labelledby="loans-title" className="flex flex-col">
          <div className="section-head">
            <h2 id="loans-title">{tr("loan.list")}</h2>
          </div>
          <ul className="m-0 list-none p-0">
            {owner.loans.map((l) => (
              <li key={l.id} className="list-row flex-wrap">
                <span className="flex flex-col">
                  <Link href={`/${locale}/advances?tab=loans&loan=${l.id}`} className="font-semibold">
                    {tr("al.loanNo", { n: l.number })}
                  </Link>
                  <span className="font-extrabold">{tr("loan.outstanding", { amount: formatMoney(locale, l.outstandingPaisa) })}</span>
                  <span className="muted">
                    {l.reason} · {l.installmentPaisa ? tr("loan.instalmentShow", { amount: formatMoney(locale, l.installmentPaisa) }) : tr("al.manual")}
                  </span>
                </span>
                {perms.loan ? (
                  <Button variant="outline" onClick={() => setOpen({ kind: "loan", loan: l })}>
                    {tr("loan.edit")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="history-title" className="flex flex-col">
        <div className="section-head">
          <h2 id="history-title">{tr("owner.history")}</h2>
        </div>
        {owner.shareHistory.length === 0 ? <p className="m-0 pt-3">{tr("owner.history.empty")}</p> : null}
        <ul className="m-0 list-none p-0">
          {owner.shareHistory.map((h) => (
            <li key={h.shareSetId} className="list-row flex-wrap">
              <span className="font-semibold">{tr("owner.history.row", { month: monthLabel(locale, h.effectiveMonth), units: h.units, reason: h.reason })}</span>
              <span className="muted">{tr("owner.history.by", { name: h.savedBy })}</span>
            </li>
          ))}
        </ul>
      </section>

      {open?.kind === "pay" || open?.kind === "advance" ? <PayDrawer locale={locale} mode={open.kind} data={data} onClose={() => setOpen(null)} onSaved={done} /> : null}
      {open?.kind === "void" && data.latestOpen ? <VoidLedgerDialog locale={locale} entry={open.entry} month={data.latestOpen} onClose={() => setOpen(null)} onDone={done} /> : null}
      {open?.kind === "adjust" && data.latestOpen ? (
        <AdjustmentDialog locale={locale} ownerId={owner.id} month={data.latestOpen} periodMonths={data.periodMonths} onClose={() => setOpen(null)} onDone={done} />
      ) : null}
      {open?.kind === "edit" ? <OwnerFormDialog locale={locale} owner={owner} users={data.linkableUsers} onClose={() => setOpen(null)} onSaved={() => router.refresh()} onGiveShares={() => setOpen(null)} /> : null}
      {open?.kind === "loan" ? <LoanInstalmentDialog locale={locale} loan={open.loan} onClose={() => setOpen(null)} onDone={done} /> : null}
      {open?.kind === "opening" ? <OpeningDialog locale={locale} ownerId={owner.id} onClose={() => setOpen(null)} onSaved={done} /> : null}
    </div>
  );
}
