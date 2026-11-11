// Rent roll (Reports PRD F9, G10): units × months with paid, arrear and empty cells.
import Link from "next/link";
import { entriesHref } from "@/components/distribution/format";
import { translator, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import type { RentRollDto } from "@/lib/reports/dto";
import { MonthBarChart } from "./charts/MonthBarChart";
import { ChartLegend } from "./charts/Legend";
import { bpPercent, moneyOrDash, monthShort, num } from "./format";

export function RentRollReport({ locale, data }: { locale: Locale; data: RentRollDto }) {
  const tr = translator(locale);
  const title = tr("rpt.rentRollTitle", { year: num(locale, data.year) });
  return (
    <article className="rpt" lang={locale}>
      <header className="rpt-head">
        <h2 className="rpt-title">{title}</h2>
      </header>
      <section className="rpt-section" aria-labelledby="rpt-rent-chart">
        <div className="section-head">
          <h3 id="rpt-rent-chart">{tr("rpt.chart.rentByMonth")}</h3>
          <ChartLegend
            items={[
              { label: tr("rpt.chart.collected"), kind: "INCOME" },
              { label: tr("rpt.rent.expected"), kind: "REFERENCE" },
            ]}
          />
        </div>
        <MonthBarChart
          locale={locale}
          kind="INCOME"
          testId="rpt-chart-rent"
          label={tr("rpt.chart.rentByMonth")}
          valueName={tr("rpt.chart.collected")}
          referenceName={tr("rpt.rent.expected")}
          data={data.months.map((m) => ({ key: m.key, value: m.status === "NONE" ? null : m.totalPaisa, reference: m.expectedPaisa }))}
        />
      </section>
      <div className="st-wrap rpt-scroll">
        <table className="st-table rpt-table rpt-month-table" aria-label={title}>
          <thead>
            <tr>
              <th className="rpt-sticky">{tr("rpt.rent.unit")}</th>
              {data.months.map((m) => (
                <th key={m.key} className="num">
                  {monthShort(locale, m.key)}
                  {m.status === "DRAFT" ? <span className="rpt-th-draft"> {tr("rpt.draft")}</span> : null}
                </th>
              ))}
              <th className="num">{tr("rpt.total")}</th>
              <th className="num">{tr("rpt.rent.expected")}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.unitId}>
                <th scope="row" className="rpt-sticky">
                  {r.name}
                  {r.tenantName ? <span className="muted block">{r.tenantName}</span> : null}
                </th>
                {r.cells.map((c, i) => (
                  <td key={data.months[i].key} className="num">
                    {c.kind === "PAID" ? (
                      <Link href={entriesHref(locale, data.months[i].key, "INCOME")} className="underline underline-offset-4">
                        {formatMoney(locale, c.amountPaisa)}
                      </Link>
                    ) : c.kind === "ARREAR" ? (
                      <>
                        <Link href={entriesHref(locale, c.paidIn, "INCOME")} className="underline underline-offset-4">
                          {formatMoney(locale, c.amountPaisa)}
                        </Link>
                        <span className="muted block">{tr("rpt.rent.arrear", { month: monthLabel(locale, c.paidIn) })}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                ))}
                <td className="num">{moneyOrDash(locale, r.totalPaisa)}</td>
                <td className="num">{moneyOrDash(locale, r.expectedPaisa)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="st-edge">
              <th scope="row" className="rpt-sticky">
                {tr("rpt.total")}
              </th>
              {data.months.map((m) => (
                <td key={m.key} className="num">
                  {moneyOrDash(locale, m.totalPaisa)}
                </td>
              ))}
              <td className="num">{moneyOrDash(locale, data.rows.reduce((s, r) => s + r.totalPaisa, 0))}</td>
              <td className="num">{moneyOrDash(locale, data.rows.reduce((s, r) => s + r.expectedPaisa, 0))}</td>
            </tr>
            <tr>
              <th scope="row" className="rpt-sticky">
                {tr("rpt.rent.expected")}
              </th>
              {data.months.map((m) => (
                <td key={m.key} className="num">
                  {moneyOrDash(locale, m.expectedPaisa)}
                </td>
              ))}
              <td />
              <td />
            </tr>
            <tr>
              <th scope="row" className="rpt-sticky">
                {tr("rpt.rent.collection")}
              </th>
              {data.months.map((m) => (
                <td key={m.key} className="num">
                  {m.collectionBp === null ? "—" : bpPercent(locale, m.collectionBp)}
                </td>
              ))}
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </article>
  );
}
