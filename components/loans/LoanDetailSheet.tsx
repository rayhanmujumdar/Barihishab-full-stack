"use client";

import { PrinterIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDateTime, translator, type Locale, type MessageKey } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import type { Open } from "./AdvancesLoansView";
import { loanLabel, movementText, shortDate } from "./format";
import { instalmentText, LoanActions, StatusTag } from "./LoanCard";
import type { LoanDetailDto, LoansPerms } from "./types";

type Change = LoanDetailDto["changes"][number];

function changeText(locale: Locale, c: Change): string {
  const tr = translator(locale);
  const inst = (v: unknown) => instalmentText(locale, ((v as { installmentPaisa?: number | null } | null)?.installmentPaisa ?? null) as number | null);
  if (c.action === "loan.updated") return tr("al.change.loan.updated", { before: inst(c.before), after: inst(c.after) });
  if (c.action === "loan.repayment_voided") return tr("al.change.loan.repayment_voided", { amount: formatMoney(locale, Number((c.after as { amountPaisa?: number })?.amountPaisa ?? 0)) });
  return tr(`al.change.${c.action}` as MessageKey);
}

/** Loan detail (F3): terms, figures, full movement history and change history. */
export function LoanDetailSheet({
  locale,
  detail,
  perms,
  onClose,
  onAction,
}: {
  locale: Locale;
  detail: LoanDetailDto;
  perms: LoansPerms;
  onClose: () => void;
  onAction: (o: Open) => void;
}) {
  const tr = translator(locale);
  const { loan } = detail;
  const label = loanLabel(locale, loan.number);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} aria-describedby={undefined} className="w-full gap-0 overflow-y-auto border-l-2 border-foreground bg-background p-0 sm:max-w-[640px]">
        <SheetHeader className="flex-row items-center justify-between gap-3 border-b-2 border-foreground px-5 py-4">
          <SheetTitle className="text-[22px] font-extrabold tracking-[-0.015em]">{tr("al.cardTitle", { loan: label, name: loan.ownerName })}</SheetTitle>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label={tr("common.close")}>
              <XMarkIcon />
            </Button>
          </SheetClose>
        </SheetHeader>
        <div className="flex flex-col gap-5 p-5" lang={locale}>
          <div className="flex flex-wrap items-center gap-2">
            <StatusTag locale={locale} status={loan.status} />
            {loan.isSelf ? <span className="font-semibold">{tr("al.self")}</span> : null}
          </div>
          <dl className="kv">
            <dt>{tr("al.detail.reason")}</dt>
            <dd>{loan.reason}</dd>
            <dt>{tr("al.detail.source")}</dt>
            <dd>{tr(`al.source.${loan.origin}` as MessageKey)}</dd>
            <dt>{tr("al.detail.disbursed")}</dt>
            <dd>{shortDate(locale, loan.disbursedOn)}</dd>
            <dt>{tr("al.detail.fund")}</dt>
            <dd>{loan.fundAccountName}</dd>
            <dt>{tr("al.detail.method")}</dt>
            <dd>{tr(`method.${loan.method}` as MessageKey)}</dd>
            <dt>{tr("al.detail.ref")}</dt>
            <dd>{loan.referenceNo ?? tr("al.none")}</dd>
          </dl>
          <section aria-label={tr("al.summary")} className="stats">
            {(
              [
                ["al.detail.amount", formatMoney(locale, loan.principalPaisa)],
                ["al.detail.repaidCash", formatMoney(locale, loan.repaidCashPaisa)],
                ["al.detail.repaidDed", formatMoney(locale, loan.repaidDeductionPaisa)],
                ["al.detail.outstanding", formatMoney(locale, loan.outstandingPaisa)],
                ["al.detail.instalment", instalmentText(locale, loan.installmentPaisa)],
                ["al.detail.finish", loan.expectedFinishMonth ? monthLabel(locale, loan.expectedFinishMonth) : tr("al.noSchedule")],
              ] as [MessageKey, string][]
            ).map(([k, v]) => (
              <div key={k} className="stat">
                <p className="kicker">{tr(k)}</p>
                <div className="text-lg font-extrabold">{v}</div>
              </div>
            ))}
          </section>
          <LoanActions locale={locale} loan={loan} perms={perms} onAction={onAction} />

          <section aria-labelledby="loan-movements" className="flex flex-col">
            <div className="section-head">
              <h3 id="loan-movements">{tr("al.detail.movements")}</h3>
            </div>
            <ol className="m-0 list-none p-0">
              {detail.movements.map((m) => {
                const kind = movementText(locale, m, monthLabel(locale, m.month));
                return (
                  <li key={m.id} className="flex flex-col gap-1 border-b border-[var(--color-divider)] py-2" data-void={m.voided ? "true" : undefined}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className={m.voided ? "text-[var(--color-neutral-600)] line-through" : "font-semibold"}>
                        {shortDate(locale, m.date)} · {kind}
                        {m.onClose && m.kind === "DEDUCTION" ? ` · ${tr("al.mv.onClose")}` : ""}
                      </span>
                      {m.kind !== "SKIPPED" ? (
                        <span className="tabular-nums">
                          <span className="font-extrabold">{formatMoney(locale, m.amountPaisa)}</span>
                          <span className="muted"> · {tr("al.col.running")} {formatMoney(locale, m.runningPaisa)}</span>
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="muted">
                        {m.recordedBy ?? ""}
                        {m.note ? ` · ${m.note}` : ""}
                        {m.voided ? ` · ${tr("al.mv.void", { reason: m.voidReason ?? "" })}` : ""}
                      </span>
                      {perms.manage && m.voidable ? (
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={tr("al.voidLabel", { kind, amount: formatMoney(locale, m.amountPaisa) })}
                          onClick={() => onAction({ kind: "void", loan, row: m })}
                        >
                          {tr("al.voidAction")}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <section aria-labelledby="loan-changes" className="flex flex-col">
            <div className="section-head">
              <h3 id="loan-changes">{tr("al.detail.changes")}</h3>
            </div>
            {detail.changes.length === 0 ? <p className="muted m-0">{tr("al.detail.noChanges")}</p> : null}
            <ul className="m-0 list-none p-0">
              {detail.changes.map((c) => (
                <li key={`${c.at}-${c.action}`} className="border-b border-[var(--color-divider)] py-2">
                  <p className="m-0 font-semibold">{changeText(locale, c)}</p>
                  {c.reason ? <p className="m-0">{c.reason}</p> : null}
                  <p className="muted m-0 text-sm">{tr("al.change.by", { name: c.by ?? "", date: formatDateTime(locale, c.at) ?? "" })}</p>
                </li>
              ))}
            </ul>
          </section>

          <Button asChild variant="outline" className="self-start">
            <a href={`/${locale}/loans/${loan.id}/statement/print`} target="_blank" rel="noreferrer">
              <PrinterIcon data-icon="inline-start" />
              {tr("al.print")}
            </a>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
