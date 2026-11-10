// Print-ready loan statement (Advances & Loans PRD F15). Server-safe: no buttons, no chrome.
import { formatDateTime, translator, type Locale, type MessageKey } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import { loanLabel, movementText, shortDate } from "./format";
import type { LoanDetailDto } from "./types";

export function PrintLoanStatement({ locale, houseName, detail, generatedAt }: { locale: Locale; houseName: string; detail: LoanDetailDto; generatedAt: string }) {
  const tr = translator(locale);
  const { loan } = detail;
  const label = loanLabel(locale, loan.number);
  return (
    <article className="flex flex-col gap-4" lang={locale}>
      <header className="flex flex-col gap-1 border-b-2 border-foreground pb-3">
        <p className="kicker">{houseName}</p>
        <h1 className="page-title">{tr("al.printTitle", { loan: label })}</h1>
        <p className="m-0 font-semibold">{loan.ownerName}</p>
        <p className="m-0">{loan.reason}</p>
        <p className="m-0">
          {tr("al.detail.amount")} {formatMoney(locale, loan.principalPaisa)} · {tr("al.detail.instalment")}{" "}
          {loan.installmentPaisa ? tr("al.perMonth", { amount: formatMoney(locale, loan.installmentPaisa) }) : tr("al.manual")} · {tr("al.filter.status")}{" "}
          {tr(`al.status.${loan.status}` as MessageKey)}
        </p>
        <p className="m-0 font-extrabold">
          {tr("al.detail.outstanding")} {formatMoney(locale, loan.outstandingPaisa)}
        </p>
        <p className="muted m-0">{tr("al.printGenerated", { date: formatDateTime(locale, generatedAt) ?? "" })}</p>
      </header>
      <table className="st-table">
        <thead>
          <tr>
            <th>{tr("al.col.date")}</th>
            <th>{tr("al.col.type")}</th>
            <th className="num">{tr("al.col.amount")}</th>
            <th className="num">{tr("al.col.running")}</th>
            <th>{tr("al.col.by")}</th>
            <th>{tr("al.col.note")}</th>
          </tr>
        </thead>
        <tbody>
          {detail.movements.map((m) => (
            <tr key={m.id} data-void={m.voided ? "true" : undefined}>
              <td>{shortDate(locale, m.date)}</td>
              <td>
                {movementText(locale, m, monthLabel(locale, m.month))}
                {m.voided ? ` · ${tr("al.mv.void", { reason: m.voidReason ?? "" })}` : ""}
              </td>
              <td className="num">{m.kind === "SKIPPED" ? "" : formatMoney(locale, m.amountPaisa)}</td>
              <td className="num">{formatMoney(locale, m.runningPaisa)}</td>
              <td>{m.recordedBy ?? ""}</td>
              <td>{m.note ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
