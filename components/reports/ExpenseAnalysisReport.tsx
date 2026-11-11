"use client";

// Expense analysis (Reports PRD F10, G12): a month range and optional
// categories (kept in the URL) → totals, categories, vendors, trend, biggest.
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { shortDate } from "@/components/entries/format";
import { Button } from "@/components/ui/button";
import { translator, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import type { ExpenseAnalysisDto } from "@/lib/reports/dto";
import { MAX_RANGE_MONTHS, monthSpan } from "@/lib/reports/params";
import { CategoryBarChart } from "./charts/CategoryBarChart";
import { MonthBarChart } from "./charts/MonthBarChart";
import { bpPercent, entryCount, moneyOrDash, monthShort, reportHref } from "./format";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const name = (locale: Locale, c: { nameEn: string; nameBn: string }) => (locale === "bn" ? c.nameBn : c.nameEn);

export function ExpenseAnalysisReport({ locale, data }: { locale: Locale; data: ExpenseAnalysisDto }) {
  const tr = translator(locale);
  const router = useRouter();
  const [from, setFrom] = useState(data.from);
  const [to, setTo] = useState(data.to);
  const [picked, setPicked] = useState<string[]>(data.categoryIds);
  const [error, setError] = useState<string | null>(null);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!MONTH.test(from) || !MONTH.test(to) || from > to || monthSpan(from, to) > MAX_RANGE_MONTHS) {
      setError(tr("rpt.exp.tooLong"));
      return;
    }
    setError(null);
    router.push(reportHref(locale, "expenses", { from, to, category: picked }));
  };
  const selected = data.categories.filter((c) => data.categoryIds.includes(c.id));

  return (
    <article className="rpt" lang={locale}>
      <form className="rpt-filter no-print" onSubmit={submit}>
        <label className="field">
          <span className="kicker">{tr("rpt.exp.from")}</span>
          <input type="month" placeholder="YYYY-MM" pattern="\d{4}-\d{2}" className="input min-h-11 border border-[var(--color-divider)] bg-[var(--color-surface)] px-3" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          <span className="kicker">{tr("rpt.exp.to")}</span>
          <input type="month" placeholder="YYYY-MM" pattern="\d{4}-\d{2}" className="input min-h-11 border border-[var(--color-divider)] bg-[var(--color-surface)] px-3" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <fieldset className="rpt-cat-pick">
          <legend className="kicker">{tr("rpt.exp.categories")}</legend>
          {data.categories.map((c) => (
            <label key={c.id} className="rpt-check">
              <input type="checkbox" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} />
              {name(locale, c)}
            </label>
          ))}
        </fieldset>
        <Button type="submit">{tr("rpt.exp.show")}</Button>
        {error ? (
          <p role="alert" className="bal-neg m-0 font-semibold">
            {error}
          </p>
        ) : null}
      </form>

      <header className="rpt-head">
        <h2 className="rpt-title">
          {tr("rpt.expensesTitle")} · {monthLabel(locale, data.from)} – {monthLabel(locale, data.to)}
        </h2>
        <p className="muted m-0">{selected.length ? selected.map((c) => name(locale, c)).join(", ") : tr("rpt.exp.allCategories")}</p>
      </header>

      {data.count === 0 ? (
        <p className="rpt-empty">{tr("rpt.exp.empty")}</p>
      ) : (
        <>
          <div className="stats">
            <div className="stat stat-signal" data-testid="rpt-exp-total">
              <span className="kicker">{tr("rpt.expensesAll")}</span>
              <span className="stat-value">{formatMoney(locale, data.totalPaisa)}</span>
              <span className="muted">{entryCount(locale, data.count)}</span>
            </div>
          </div>
          <p className="muted m-0">{tr("rpt.fromReserve", { amount: formatMoney(locale, data.fromReservePaisa) })}</p>

          <div className="rpt-columns">
            <section className="rpt-section" aria-labelledby="rpt-exp-cat">
              <div className="section-head">
                <h3 id="rpt-exp-cat">{tr("rpt.exp.byCategory")}</h3>
              </div>
              <CategoryBarChart
                locale={locale}
                kind="EXPENSE"
                label={tr("rpt.chart.byCategory", { title: tr("rpt.expensesAll") })}
                data={data.byCategory.map((c) => ({ key: c.categoryId, name: name(locale, c), amountPaisa: c.amountPaisa, shareBp: c.shareBp }))}
              />
              <ul className="rpt-top">
                {data.byCategory.map((c) => (
                  <li key={c.categoryId}>
                    <span>
                      {name(locale, c)} · {entryCount(locale, c.count)}
                    </span>
                    <span className="font-extrabold">
                      {formatMoney(locale, c.amountPaisa)} · {bpPercent(locale, c.shareBp)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rpt-section" aria-labelledby="rpt-exp-vendors">
              <div className="section-head">
                <h3 id="rpt-exp-vendors">{tr("rpt.exp.vendors")}</h3>
              </div>
              <ul className="rpt-top">
                {data.topVendors.map((v) => (
                  <li key={v.vendor ?? ""}>
                    <span>{v.vendor ?? tr("rpt.exp.noVendor")}</span>
                    <span className="font-extrabold">{formatMoney(locale, v.amountPaisa)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="rpt-section" aria-labelledby="rpt-exp-trend">
            <div className="section-head">
              <h3 id="rpt-exp-trend">{tr("rpt.exp.trend")}</h3>
            </div>
            <MonthBarChart
              locale={locale}
              kind="EXPENSE"
              testId="rpt-chart-trend"
              label={tr("rpt.chart.trend")}
              valueName={tr("rpt.expensesAll")}
              data={data.trend.map((t) => ({ key: t.month, value: t.totalPaisa }))}
            />
            <div className="st-wrap rpt-scroll">
              <table className="st-table rpt-table rpt-month-table" aria-labelledby="rpt-exp-trend">
                <thead>
                  <tr>
                    <th className="rpt-sticky" />
                    {data.trend.map((t) => (
                      <th key={t.month} className="num">
                        {monthShort(locale, t.month)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selected.map((c) => (
                    <tr key={c.id}>
                      <th scope="row" className="rpt-sticky">
                        {name(locale, c)}
                      </th>
                      {data.trend.map((t) => (
                        <td key={t.month} className="num">
                          {moneyOrDash(locale, t.amounts[c.id])}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="st-edge">
                    <th scope="row" className="rpt-sticky">
                      {tr("rpt.total")}
                    </th>
                    {data.trend.map((t) => (
                      <td key={t.month} className="num">
                        {moneyOrDash(locale, t.totalPaisa)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="rpt-section" aria-labelledby="rpt-exp-big">
            <div className="section-head">
              <h3 id="rpt-exp-big">{tr("rpt.exp.biggest")}</h3>
            </div>
            <div className="st-wrap">
              <table className="st-table rpt-table" aria-labelledby="rpt-exp-big">
                <thead>
                  <tr>
                    <th>{tr("rpt.col.date")}</th>
                    <th>{tr("rpt.col.category")}</th>
                    <th>{tr("rpt.col.description")}</th>
                    <th>{tr("rpt.col.vendor")}</th>
                    <th className="num">{tr("rpt.col.amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topExpenses.map((e) => (
                    <tr key={e.id}>
                      <td>{shortDate(locale, e.date)}</td>
                      <td>{locale === "bn" ? e.categoryNameBn : e.categoryNameEn}</td>
                      <td>{e.description ?? "—"}</td>
                      <td>{e.vendor ?? "—"}</td>
                      <td className="num">{formatMoney(locale, e.amountPaisa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </article>
  );
}
