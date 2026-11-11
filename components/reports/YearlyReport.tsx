// Yearly report (Reports PRD F3, F4; RPT-02). Shared by screen and print.
import { categoryName } from "@/components/entries/format";
import { balanceText, balanceTone, percent } from "@/components/owners/format";
import { translator, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import type { YearlyReportDto } from "@/lib/reports/dto";
import { cn } from "@/lib/utils";
import { bpPercent, moneyOrDash, monthShort, num } from "./format";
import { YearChart } from "./charts/YearChart";
import { ChartLegend } from "./charts/Legend";
import { Statements } from "./MonthlyReport";

type Props = { locale: Locale; data: YearlyReportDto; mode?: "screen" | "print" };

export function YearlyReport({ locale, data, mode = "screen" }: Props) {
  const tr = translator(locale);
  const t = data.totals;
  return (
    <article className="rpt" lang={locale}>
      <header className="rpt-head">
        <h2 className="rpt-title">{tr("rpt.yearlyTitle", { year: num(locale, data.year) })}</h2>
        {data.empty ? null : <p className="muted m-0">{t.closedCount === 1 ? tr("rpt.monthsClosedOne", { m: num(locale, t.draftCount) }) : tr("rpt.monthsClosed", { n: num(locale, t.closedCount), m: num(locale, t.draftCount) })}</p>}
      </header>
      {data.empty ? (
        <p className="rpt-empty">{tr("rpt.noYearData", { year: num(locale, data.year) })}</p>
      ) : (
        <>
          <div className="stats rpt-year-totals">
            <Total locale={locale} label={tr("rpt.income")} closed={t.closed.incomePaisa} draft={t.draftCount ? t.draft.incomePaisa : null} />
            <Total locale={locale} label={tr("rpt.expensesAll")} closed={t.closed.expensesAllPaisa} draft={t.draftCount ? t.draft.expensesAllPaisa : null} />
            <Total locale={locale} label={tr("rpt.distributable")} closed={t.closed.distributablePaisa} draft={t.draftCount ? t.draft.distributablePaisa : null} signal />
          </div>
          <YearChartSection locale={locale} data={data} print={mode === "print"} />
          <MonthTable locale={locale} data={data} />
          {data.topExpenseCategories.length ? (
            <section className="rpt-section" aria-labelledby="rpt-top">
              <div className="section-head">
                <h3 id="rpt-top">{tr("rpt.topCategories")}</h3>
              </div>
              <ol className="rpt-top">
                {data.topExpenseCategories.map((c) => (
                  <li key={c.categoryId}>
                    <span>{categoryName(locale, c)}</span>
                    <span className="font-extrabold">
                      {formatMoney(locale, c.amountPaisa)} · {bpPercent(locale, c.shareBp)}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          <OwnerYearTable locale={locale} data={data} />
          {mode === "screen" ? <Statements locale={locale} rows={data.owners.rows} from={`${data.year}-01`} to={`${data.year}-12`} /> : null}
        </>
      )}
    </article>
  );
}

function Total({ locale, label, closed, draft, signal }: { locale: Locale; label: string; closed: number; draft: number | null; signal?: boolean }) {
  const tr = translator(locale);
  return (
    <div className={cn("stat", signal && "stat-signal")} data-testid={signal ? "rpt-year-distributable" : undefined}>
      <span className="kicker">
        {label} · {tr("rpt.closedMonths")}
      </span>
      <span className="stat-value">{formatMoney(locale, closed)}</span>
      {draft !== null ? <span className="rpt-draft-note">{tr("rpt.plusDraft", { amount: formatMoney(locale, draft) })}</span> : null}
    </div>
  );
}

function YearChartSection({ locale, data, print }: { locale: Locale; data: YearlyReportDto; print: boolean }) {
  const tr = translator(locale);
  return (
    <section className="rpt-section" aria-labelledby="rpt-chart">
      <div className="section-head">
        <h3 id="rpt-chart">{tr("rpt.chart")}</h3>
        <ChartLegend
          items={[
            { label: tr("rpt.income"), kind: "INCOME" },
            { label: tr("rpt.expensesAll"), kind: "EXPENSE" },
            { label: tr("rpt.draft"), kind: "DRAFT" },
          ]}
        />
      </div>
      <YearChart locale={locale} data={data} print={print} />
    </section>
  );
}

function MonthTable({ locale, data }: { locale: Locale; data: YearlyReportDto }) {
  const tr = translator(locale);
  const c = data.totals.closed;
  const rows = [
    ["rpt.income", (f) => f.incomePaisa, c.incomePaisa],
    ["rpt.expensesAll", (f) => f.expensesAllPaisa, c.expensesAllPaisa],
    ["rpt.row.fromReserve", (f) => f.fromReservePaisa, c.fromReservePaisa],
    ["rpt.row.reserve", (f) => f.reservePaisa, c.reservePaisa],
    ["rpt.row.deficit", (f) => f.deficitCarriedPaisa, null],
    ["rpt.distributable", (f) => f.distributablePaisa, c.distributablePaisa],
  ] as const satisfies readonly (readonly [Parameters<typeof tr>[0], (f: NonNullable<YearlyReportDto["months"][number]["figure"]>) => number, number | null])[];
  return (
    <section className="rpt-section rpt-break" aria-labelledby="rpt-months">
      <div className="section-head">
        <h3 id="rpt-months">{tr("rpt.monthTable")}</h3>
      </div>
      <div className="st-wrap rpt-scroll">
        <table className="st-table rpt-table rpt-month-table" aria-labelledby="rpt-months">
          <thead>
            <tr>
              <th className="rpt-sticky" />
              {data.months.map((m) => (
                <th key={m.month} className="num">
                  {monthShort(locale, m.month)}
                  {m.status === "DRAFT" ? <span className="rpt-th-draft"> {tr("rpt.draft")}</span> : null}
                </th>
              ))}
              <th className="num">{tr("rpt.totalClosed")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, pick, total]) => (
              <tr key={label} className={label === "rpt.distributable" ? "st-edge" : undefined}>
                <th scope="row" className="rpt-sticky">
                  {tr(label)}
                </th>
                {data.months.map((m) => (
                  <td key={m.month} className="num" data-draft={m.status === "DRAFT" || undefined}>
                    {m.figure ? moneyOrDash(locale, pick(m.figure)) : "—"}
                  </td>
                ))}
                <td className="num">{total === null ? "—" : moneyOrDash(locale, total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OwnerYearTable({ locale, data }: { locale: Locale; data: YearlyReportDto }) {
  const tr = translator(locale);
  const { rows, totals } = data.owners;
  const m = (p: number) => moneyOrDash(locale, p);
  const title = tr("rpt.ownerYear", { year: num(locale, data.year) });
  return (
    <section className="rpt-section rpt-break" aria-labelledby="rpt-owner-year">
      <div className="section-head">
        <h3 id="rpt-owner-year">{title}</h3>
      </div>
      <div className="st-wrap rpt-scroll">
        <table className="st-table rpt-table" aria-labelledby="rpt-owner-year">
          <thead>
            <tr>
              <th className="rpt-sticky">{tr("rpt.col.owner")}</th>
              <th>{tr("rpt.col.shareNow")}</th>
              <th className="num">{tr("rpt.col.openingJan")}</th>
              <th className="num">{tr("rpt.col.entitlement")}</th>
              <th className="num">{tr("rpt.col.paidOut")}</th>
              <th className="num">{tr("rpt.col.advances")}</th>
              <th className="num">{tr("rpt.col.loanDed")}</th>
              <th>{tr("rpt.col.balanceNow")}</th>
              <th className="num">{tr("rpt.col.loan")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const b = balanceText(locale, r.balanceLabel, r.balanceNowPaisa);
              return (
                <tr key={r.ownerId}>
                  <th scope="row" className="rpt-sticky">
                    {r.displayName}
                  </th>
                  <td>
                    {r.sharePercentNow === null ? "—" : percent(locale, r.sharePercentNow)}
                    {r.shareChanges.map((c) => (
                      <span key={c.month} className="muted block">
                        {tr("rpt.shareChanged", { month: monthLabel(locale, c.month), before: percent(locale, c.percentBefore), after: percent(locale, c.percentAfter) })}
                      </span>
                    ))}
                  </td>
                  <td className="num">{m(r.openingPaisa)}</td>
                  <td className="num">{m(r.entitlementPaisa)}</td>
                  <td className="num">{m(r.paidOutPaisa)}</td>
                  <td className="num">{m(r.advancesPaisa)}</td>
                  <td className="num">{m(r.loanDeductionPaisa)}</td>
                  <td>
                    <span className={cn("bal-tag", `bal-${balanceTone(r.balanceNowPaisa)}`)}>
                      {b.amount ? `${b.amount} · ` : ""}
                      {b.word}
                    </span>
                  </td>
                  <td className="num">{m(r.loanOutstandingPaisa)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="st-edge">
              <th scope="row" className="rpt-sticky">
                {tr("rpt.total")}
              </th>
              <td />
              <td className="num">{m(totals.openingPaisa)}</td>
              <td className="num">{m(totals.entitlementPaisa)}</td>
              <td className="num">{m(totals.paidOutPaisa)}</td>
              <td className="num">{m(totals.advancesPaisa)}</td>
              <td className="num">{m(totals.loanDeductionPaisa)}</td>
              <td className="num">{formatMoney(locale, totals.balanceNowPaisa)}</td>
              <td className="num">{m(totals.loanOutstandingPaisa)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
