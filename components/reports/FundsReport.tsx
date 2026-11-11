// Fund accounts report (Reports PRD F11, G11): opening → moves → closing per account.
import Link from "next/link";
import { translator, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { currentMonthKey, monthLabel } from "@/lib/periods/month";
import type { FundsReportDto } from "@/lib/reports/dto";
import { cn } from "@/lib/utils";
import { FundsChart } from "./charts/FundsChart";
import { ChartLegend } from "./charts/Legend";
import { moneyOrDash, num, reportHref } from "./format";

const MOVES = [
  ["incomePaisa", "rpt.fund.income"],
  ["expensesPaisa", "rpt.fund.expenses"],
  ["ownerPaymentsPaisa", "rpt.fund.owners"],
  ["loansOutPaisa", "rpt.fund.loansOut"],
  ["loanRepaymentsPaisa", "rpt.fund.repayments"],
] as const;

export function FundsReport({ locale, data }: { locale: Locale; data: FundsReportDto }) {
  const tr = translator(locale);
  const p = data.period;
  const periodText = p.kind === "month" ? monthLabel(locale, p.month) : num(locale, p.year);
  const title = tr("rpt.fundsTitle", { period: periodText });
  const month = p.kind === "month" ? p.month : (data.months.find((m) => m.key.startsWith(`${p.year}-`))?.key ?? data.months[0]?.key ?? currentMonthKey());
  const year = p.kind === "year" ? p.year : Number(p.month.slice(0, 4));
  return (
    <article className="rpt" lang={locale}>
      <header className="rpt-head">
        <h2 className="rpt-title">{title}</h2>
        <nav className="rpt-seg" aria-label={tr("rpt.fund.mode")}>
          <Link href={reportHref(locale, "funds", { month })} aria-current={p.kind === "month" ? "page" : undefined} className={cn("rpt-seg-opt", p.kind === "month" && "rpt-seg-active")}>
            {tr("rpt.fund.month")}
          </Link>
          <Link href={reportHref(locale, "funds", { year })} aria-current={p.kind === "year" ? "page" : undefined} className={cn("rpt-seg-opt", p.kind === "year" && "rpt-seg-active")}>
            {tr("rpt.fund.year")}
          </Link>
        </nav>
      </header>
      {data.rows.length ? (
        <section className="rpt-section" aria-labelledby="rpt-funds-chart">
          <div className="section-head">
            <h3 id="rpt-funds-chart">{tr("rpt.chart.funds")}</h3>
            <ChartLegend
              items={[
                { label: tr("rpt.chart.in"), kind: "INCOME" },
                { label: tr("rpt.chart.out"), kind: "EXPENSE" },
              ]}
            />
          </div>
          <FundsChart locale={locale} data={data} label={tr("rpt.chart.funds")} />
        </section>
      ) : null}
      <div className="st-wrap rpt-scroll">
        <table className="st-table rpt-table" aria-label={title}>
          <thead>
            <tr>
              <th className="rpt-sticky">{tr("rpt.fund.account")}</th>
              <th className="num">{tr("rpt.fund.opening")}</th>
              {MOVES.map(([, label]) => (
                <th key={label} className="num">
                  {tr(label)}
                </th>
              ))}
              <th className="num">{tr("rpt.fund.closing")}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.fundAccountId}>
                <th scope="row" className="rpt-sticky">
                  {r.name}
                  {r.isActive ? null : <span className="muted"> · {tr("rpt.fund.inactive")}</span>}
                </th>
                <td className="num">{formatMoney(locale, r.openingPaisa)}</td>
                {MOVES.map(([k]) => (
                  <td key={k} className="num">
                    {moneyOrDash(locale, r[k])}
                  </td>
                ))}
                <td className="num">{formatMoney(locale, r.closingPaisa)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="st-edge">
              <th scope="row" className="rpt-sticky">
                {tr("rpt.total")}
              </th>
              <td className="num">{formatMoney(locale, data.totals.openingPaisa)}</td>
              {MOVES.map(([k]) => (
                <td key={k} className="num">
                  {moneyOrDash(locale, data.totals[k])}
                </td>
              ))}
              <td className="num">{formatMoney(locale, data.totals.closingPaisa)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </article>
  );
}
