// Monthly report (Reports PRD F2, F4, F8; RPT-01, RPT-04). The same component
// renders on screen and in the print view, so both show the same figures.
import Link from "next/link";
import { formatDay } from "@/components/distribution/format";
import { categoryName, shortDate } from "@/components/entries/format";
import { balanceText, balanceTone, ownerHref, percent } from "@/components/owners/format";
import { Badge } from "@/components/ui/badge";
import { translator, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { addMonths, monthLabel } from "@/lib/periods/month";
import type { CompareFigure, MonthlyReportDto, OwnerRow } from "@/lib/reports/dto";
import { cn } from "@/lib/utils";
import { CategoryList } from "./CategoryList";
import { CategoryBarChart } from "./charts/CategoryBarChart";
import { changeText, moneyOrDash, num } from "./format";

type Props = { locale: Locale; data: MonthlyReportDto; mode?: "screen" | "print" };

export function MonthlyReport({ locale, data, mode = "screen" }: Props) {
  const tr = translator(locale);
  const print = mode === "print";
  const month = monthLabel(locale, data.month.key);
  const money = (p: number) => formatMoney(locale, p);
  const s = data.summary;
  return (
    <article className="rpt" lang={locale}>
      <header className="rpt-head">
        <h2 className="rpt-title">{tr("rpt.monthlyTitle", { month })}</h2>
        <StatusTag locale={locale} status={data.month.status} closedAt={data.month.closedAt} />
        <p className="rpt-summary">
          <span>{tr("rpt.summary.income", { amount: money(s.incomePaisa) })}</span>
          <span>{tr("rpt.summary.expenses", { amount: money(s.expensesAllPaisa) })}</span>
          <span className="font-extrabold">{tr("rpt.summary.distributable", { amount: money(s.distributablePaisa) })}</span>
          {s.deficitCarriedPaisa > 0 ? <span className="bal-neg">{tr("rpt.summary.deficit", { amount: money(s.deficitCarriedPaisa) })}</span> : null}
        </p>
        <Comparisons locale={locale} data={data} />
      </header>

      {data.empty ? <p className="rpt-empty">{tr("rpt.noEntries", { month })}</p> : null}

      <div className="rpt-columns">
        <section className="rpt-section" aria-labelledby="rpt-income">
          <div className="section-head">
            <h3 id="rpt-income">{tr("rpt.income")}</h3>
            <span className="rpt-total">{moneyOrDash(locale, data.income.totalPaisa)}</span>
          </div>
          <CategoryChart locale={locale} data={data} kind="INCOME" print={print} />
          <CategoryList locale={locale} categories={data.income.categories} kind="INCOME" print={print} />
        </section>
        <section className="rpt-section" aria-labelledby="rpt-expenses">
          <div className="section-head">
            <h3 id="rpt-expenses">{tr("rpt.expensesAll")}</h3>
            <span className="rpt-total">{moneyOrDash(locale, data.expenses.totalPaisa)}</span>
          </div>
          <p className="muted rpt-of-which">{tr("rpt.fromReserve", { amount: money(data.expenses.fromReservePaisa) })}</p>
          <CategoryChart locale={locale} data={data} kind="EXPENSE" print={print} />
          <CategoryList locale={locale} categories={data.expenses.categories} kind="EXPENSE" print={print} />
        </section>
      </div>

      <ReportStaircase locale={locale} data={data} />
      <OwnerTable locale={locale} data={data} />
      <Notes locale={locale} data={data} />
      {print ? <EntriesAppendix locale={locale} data={data} /> : <Statements locale={locale} rows={data.owners.rows} from={data.month.key} to={data.month.key} />}
    </article>
  );
}

function CategoryChart({ locale, data, kind, print }: { locale: Locale; data: MonthlyReportDto; kind: "INCOME" | "EXPENSE"; print: boolean }) {
  const tr = translator(locale);
  const cats = (kind === "INCOME" ? data.income : data.expenses).categories;
  return (
    <CategoryBarChart
      locale={locale}
      kind={kind}
      print={print}
      printWidth={330}
      label={tr("rpt.chart.byCategory", { title: tr(kind === "INCOME" ? "rpt.income" : "rpt.expensesAll") })}
      data={cats.map((c) => ({ key: c.categoryId, name: categoryName(locale, c), amountPaisa: c.amountPaisa, shareBp: c.shareBp }))}
    />
  );
}

export function StatusTag({ locale, status, closedAt }: { locale: Locale; status: "FINAL" | "DRAFT"; closedAt: string | null }) {
  const tr = translator(locale);
  return status === "DRAFT" ? (
    <Badge variant="accent" className="rpt-status">
      {tr("rpt.draftTag")}
    </Badge>
  ) : (
    <Badge variant="neutral" className="rpt-status">
      {closedAt ? tr("rpt.finalTag", { date: formatDay(locale, closedAt) }) : tr("rpt.final")}
    </Badge>
  );
}

function Comparisons({ locale, data }: { locale: Locale; data: MonthlyReportDto }) {
  const tr = translator(locale);
  const lines = (base: CompareFigure | null) =>
    base
      ? ([
          ["rpt.income", data.summary.incomePaisa, base.incomePaisa],
          ["rpt.expensesAll", data.summary.expensesAllPaisa, base.expensesAllPaisa],
          ["rpt.distributable", data.summary.distributablePaisa, base.distributablePaisa],
        ] as const).map(([label, now, before]) => ({ label, base, text: tr("rpt.vs", { month: monthLabel(locale, base.key), change: changeText(locale, now, before).text }) }))
      : [];
  const all = [...lines(data.compare.lastMonth), ...lines(data.compare.lastYear)];
  if (!all.length) return null;
  return (
    <ul className="rpt-compare">
      {all.map((l) => (
        <li key={`${l.base.key}-${l.label}`}>
          <span className="kicker">{tr(l.label)}</span> <span>{l.text}</span>
        </li>
      ))}
    </ul>
  );
}

function ReportStaircase({ locale, data }: { locale: Locale; data: MonthlyReportDto }) {
  const tr = translator(locale);
  const s = data.staircase;
  const money = (p: number) => formatMoney(locale, p);
  const cell = (label: string, value: number, op?: string, extra?: string) => (
    <div className={cn("stair-cell", extra)} data-testid={extra ? "rpt-distributable" : undefined}>
      <span className="stair-label">
        <span className="kicker">{label}</span>
        {op ? (
          <span className="stair-op" aria-hidden>
            {op}
          </span>
        ) : null}
      </span>
      <span className="stat-value">{money(value)}</span>
    </div>
  );
  return (
    <section className="rpt-section" aria-labelledby="rpt-stair">
      <div className="section-head">
        <h3 id="rpt-stair">{tr("rpt.staircase")}</h3>
      </div>
      <div className="stair">
        {cell(tr("rpt.income"), s.incomePaisa)}
        {cell(tr("rpt.stair.expenses"), s.expensesCountedPaisa, "−")}
        {cell(tr("rpt.stair.reserve"), s.reservePaisa, "−")}
        {cell(tr("rpt.stair.prevDeficit"), s.previousDeficitPaisa, "−")}
        {cell(tr("rpt.distributable"), s.distributablePaisa, "=", "stair-total")}
      </div>
      {s.deficitCarriedPaisa > 0 || s.reserveSpentPaisa > 0 ? (
        <ul className="stair-notes">
          {s.deficitCarriedPaisa > 0 ? (
            <li className="bal-neg font-semibold">{tr("rpt.note.deficit", { amount: money(s.deficitCarriedPaisa), month: monthLabel(locale, addMonths(data.month.key, 1)) })}</li>
          ) : null}
          {s.reserveSpentPaisa > 0 ? <li className="muted">{tr("rpt.note.reserveSpent", { amount: money(s.reserveSpentPaisa) })}</li> : null}
        </ul>
      ) : null}
    </section>
  );
}

function Balance({ locale, row }: { locale: Locale; row: Pick<OwnerRow, "balanceLabel" | "balancePaisa"> }) {
  const b = balanceText(locale, row.balanceLabel, row.balancePaisa);
  return (
    <span className={cn("bal-tag", `bal-${balanceTone(row.balancePaisa)}`)}>
      {b.amount ? `${b.amount} · ` : ""}
      {b.word}
    </span>
  );
}

function OwnerTable({ locale, data }: { locale: Locale; data: MonthlyReportDto }) {
  const tr = translator(locale);
  const { rows, totals } = data.owners;
  const showOther = rows.some((r) => r.otherPaisa !== 0);
  const m = (p: number) => moneyOrDash(locale, p);
  return (
    <section className="rpt-section rpt-break" aria-labelledby="rpt-owners">
      <div className="section-head">
        <h3 id="rpt-owners">{tr("rpt.owners")}</h3>
      </div>
      <div className="st-wrap rpt-scroll">
        <table className="st-table rpt-table" aria-labelledby="rpt-owners">
          <thead>
            <tr>
              <th className="rpt-sticky">{tr("rpt.col.owner")}</th>
              <th>{tr("rpt.col.share")}</th>
              <th className="num">{tr("rpt.col.opening")}</th>
              <th className="num">{tr("rpt.col.entitlement")}</th>
              <th className="num">{tr("rpt.col.received")}</th>
              <th className="num">{tr("rpt.col.advance")}</th>
              <th className="num">{tr("rpt.col.loanDed")}</th>
              {showOther ? <th className="num">{tr("rpt.col.other")}</th> : null}
              <th>{tr("rpt.col.balance")}</th>
              <th className="num">{tr("rpt.col.loan")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ownerId}>
                <th scope="row" className="rpt-sticky">
                  {r.displayName}
                </th>
                <td>{r.sharePercent === null ? "—" : `${percent(locale, r.sharePercent)} · ${num(locale, r.units)}`}</td>
                <td className="num">{m(r.openingPaisa)}</td>
                <td className="num">{m(r.entitlementPaisa)}</td>
                <td className="num">{m(r.receivedPaisa)}</td>
                <td className="num">{m(r.advancePaisa)}</td>
                <td className="num">{m(r.loanDeductionPaisa)}</td>
                {showOther ? <td className="num">{m(r.otherPaisa)}</td> : null}
                <td>
                  <Balance locale={locale} row={r} />
                </td>
                <td className="num">{m(r.loanOutstandingPaisa)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="st-edge">
              <th scope="row" className="rpt-sticky">
                {tr("rpt.total")}
              </th>
              <td />
              <td className="num">{m(totals.openingPaisa)}</td>
              <td className="num">{m(totals.entitlementPaisa)}</td>
              <td className="num">{m(totals.receivedPaisa)}</td>
              <td className="num">{m(totals.advancePaisa)}</td>
              <td className="num">{m(totals.loanDeductionPaisa)}</td>
              {showOther ? <td className="num">{m(totals.otherPaisa)}</td> : null}
              <td className="num">{formatMoney(locale, totals.balancePaisa)}</td>
              <td className="num">{m(totals.loanOutstandingPaisa)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function Notes({ locale, data }: { locale: Locale; data: MonthlyReportDto }) {
  const tr = translator(locale);
  const n = data.notes;
  const items = [
    n.reopen ? tr("rpt.note.reopen", { month: monthLabel(locale, data.month.key), date: formatDay(locale, n.reopen.at), reason: n.reopen.reason }) : null,
    n.overrideReason ? tr("rpt.note.override", { reason: n.overrideReason }) : null,
    n.unpaidUnits.length
      ? tr("rpt.note.unpaid", { n: num(locale, n.unpaidUnits.length), units: n.unpaidUnits.map((u) => (u.tenantName ? `${u.name} (${u.tenantName})` : u.name)).join(", ") })
      : null,
  ].filter((x): x is string => x !== null);
  if (!items.length) return null;
  return (
    <section className="rpt-section" aria-labelledby="rpt-notes">
      <div className="section-head">
        <h3 id="rpt-notes">{tr("rpt.notes")}</h3>
      </div>
      <ul className="rpt-notes">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </section>
  );
}

export function Statements({ locale, rows, from, to }: { locale: Locale; rows: { ownerId: string; displayName: string }[]; from: string; to: string }) {
  const tr = translator(locale);
  if (!rows.length) return null;
  return (
    <nav className="rpt-section no-print" aria-label={tr("rpt.statements")}>
      <div className="section-head">
        <h3>{tr("rpt.statements")}</h3>
      </div>
      <ul className="rpt-links">
        {rows.map((r) => (
          <li key={r.ownerId}>
            <Link href={ownerHref(locale, r.ownerId, { from, to })} className="font-extrabold underline underline-offset-4">
              {r.displayName}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Every entry of the month, oldest first (F6 Entries appendix). */
function EntriesAppendix({ locale, data }: { locale: Locale; data: MonthlyReportDto }) {
  const tr = translator(locale);
  const rows = [...data.income.categories, ...data.expenses.categories]
    .flatMap((c) => c.entries.map((e) => ({ e, c })))
    .sort((a, b) => a.e.date.localeCompare(b.e.date));
  return (
    <section className="rpt-section rpt-break" aria-labelledby="rpt-appendix">
      <div className="section-head">
        <h3 id="rpt-appendix">{tr("rpt.print.appendix")}</h3>
      </div>
      <table className="st-table rpt-table" aria-labelledby="rpt-appendix">
        <thead>
          <tr>
            <th>{tr("rpt.col.date")}</th>
            <th>{tr("rpt.col.category")}</th>
            <th>{tr("rpt.col.description")}</th>
            <th>{tr("rpt.col.vendor")}</th>
            <th>{tr("rpt.col.fund")}</th>
            <th className="num">{tr("rpt.col.amount")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ e, c }) => (
            <tr key={e.id}>
              <td>{shortDate(locale, e.date)}</td>
              <td>{categoryName(locale, c)}</td>
              <td>
                {e.description ?? "—"}
                {e.fromReserve ? ` · ${tr("rpt.reserveTag")}` : ""}
              </td>
              <td>{e.vendor ?? e.unitName ?? "—"}</td>
              <td>{e.fundName}</td>
              <td className="num">{formatMoney(locale, e.amountPaisa)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
