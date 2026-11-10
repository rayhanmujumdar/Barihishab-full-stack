"use client";

import { EllipsisHorizontalIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { RequestTag } from "@/components/requests/RequestTag";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { translator, type Locale, type MessageKey } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import type { Open } from "./AdvancesLoansView";
import { loanLabel, movementText, shortDate } from "./format";
import type { LoanCardDto, LoansPerms, LoanStatus } from "./types";

/** Status as a word; Active is the one yellow fill (Rule 15). */
export function StatusTag({ locale, status }: { locale: Locale; status: LoanStatus }) {
  const tr = translator(locale);
  return status === "ACTIVE" ? (
    <Badge className="rounded-none bg-[var(--signal)] text-foreground">{tr("al.status.ACTIVE")}</Badge>
  ) : (
    <Badge variant="neutral" className="rounded-none">
      {tr(`al.status.${status}` as MessageKey)}
    </Badge>
  );
}

/** Instalment line: "৳5,000 / month" or "Manual". */
export const instalmentText = (locale: Locale, paisa: number | null) => {
  const tr = translator(locale);
  return paisa ? tr("al.perMonth", { amount: formatMoney(locale, paisa) }) : tr("al.manual");
};

/** Super Admin actions on an active loan: Record repayment + ⋯ (Change instalment, Cancel, Write off). */
export function LoanActions({ locale, loan, perms, onAction }: { locale: Locale; loan: LoanCardDto; perms: LoansPerms; onAction: (o: Open) => void }) {
  const tr = translator(locale);
  if (loan.status !== "ACTIVE" || (!perms.repay && !perms.manage)) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {perms.repay ? <Button onClick={() => onAction({ kind: "repay", loan })}>{tr("al.recordRepayment")}</Button> : null}
      {perms.manage ? (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label={tr("al.more", { loan: loanLabel(locale, loan.number) })}>
              <EllipsisHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52 rounded-none border-2 border-foreground">
            <DropdownMenuItem onSelect={() => onAction({ kind: "instalment", loan })}>{tr("al.changeInstalment")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction({ kind: "cancel", loan })}>{tr("al.cancelLoan")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction({ kind: "writeoff", loan })}>{tr("al.writeOff")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

/** One loan (F2): header, reason, terms, progress, schedule, last 3 movements. */
export function LoanCard({
  locale,
  loan,
  perms,
  onSeeAll,
  onAction,
}: {
  locale: Locale;
  loan: LoanCardDto;
  perms: LoansPerms;
  onSeeAll: () => void;
  onAction: (o: Open) => void;
}) {
  const tr = translator(locale);
  const label = loanLabel(locale, loan.number);
  const pct = Math.min(100, Math.round(loan.progress * 100));
  return (
    <article className="flex flex-col gap-3 border-t-2 border-foreground bg-[var(--color-surface)] p-4" aria-labelledby={`loan-${loan.id}`} data-status={loan.status}>
      <header className="flex flex-wrap items-center gap-2">
        <h2 id={`loan-${loan.id}`} className="m-0 text-xl font-extrabold tracking-[-0.015em]">
          {tr("al.cardTitle", { loan: label, name: loan.ownerName })}
        </h2>
        <StatusTag locale={locale} status={loan.status} />
        {loan.isSelf ? (
          <Badge variant="outline" className="rounded-none">
            {tr("al.self")}
          </Badge>
        ) : null}
        {loan.flagged ? (
          <Badge variant="destructive" className="rounded-none">
            {tr("al.flagged")}
          </Badge>
        ) : null}
      </header>
      <p className="m-0">{loan.reason}</p>
      {loan.request ? <RequestTag locale={locale} request={loan.request} /> : null}
      <p className="muted m-0">
        {tr("al.disbursed", { date: shortDate(locale, loan.disbursedOn) })} · {instalmentText(locale, loan.installmentPaisa)} · {tr(`al.source.${loan.origin}` as MessageKey)}
      </p>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">{tr("al.repaidOf", { repaid: formatMoney(locale, loan.repaidPaisa), total: formatMoney(locale, loan.principalPaisa) })}</span>
        <span className="text-lg font-extrabold">{tr("al.left", { amount: formatMoney(locale, loan.outstandingPaisa) })}</span>
      </div>
      <div role="progressbar" aria-label={tr("al.progress", { loan: label })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2 w-full bg-[var(--color-neutral-300)]">
        <div className="h-full bg-foreground" style={{ width: `${pct}%` }} />
      </div>
      {loan.expectedFinishMonth ? <p className="m-0 font-semibold">{tr("al.finish", { month: monthLabel(locale, loan.expectedFinishMonth) })}</p> : null}
      {loan.nextDeduction ? (
        <p className="muted m-0">{tr("al.next", { amount: formatMoney(locale, loan.nextDeduction.amountPaisa), month: monthLabel(locale, loan.nextDeduction.month) })}</p>
      ) : null}
      <ul className="m-0 list-none border-t border-[var(--color-divider)] p-0">
        {loan.recentMovements.map((m) => (
          <li key={m.id} className="flex justify-between gap-3 py-1 text-sm" data-void={m.voided ? "true" : undefined}>
            <span className={m.voided ? "text-[var(--color-neutral-600)] line-through" : undefined}>
              {shortDate(locale, m.date)} · {movementText(locale, m, monthLabel(locale, m.month))}
            </span>
            {m.kind !== "SKIPPED" ? <span className="font-semibold tabular-nums">{formatMoney(locale, m.amountPaisa)}</span> : null}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" className="pl-0" onClick={onSeeAll}>
          {tr("al.seeAll")}
        </Button>
        <LoanActions locale={locale} loan={loan} perms={perms} onAction={onAction} />
      </div>
    </article>
  );
}
