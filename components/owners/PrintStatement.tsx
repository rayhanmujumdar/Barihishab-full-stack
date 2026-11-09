// Print-ready owner statement (F4). Server component: no buttons, no chrome.
import { shortDate } from "@/components/entries/format";
import { formatDateTime, translator, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import { balanceText, percent, signedMoney, typeLabel } from "./format";
import type { LedgerType, StatementDto } from "./types";

export function PrintStatement({
  locale,
  houseName,
  statement,
  generatedAt,
  generatedBy,
}: {
  locale: Locale;
  houseName: string;
  statement: StatementDto;
  generatedAt: string;
  generatedBy: string;
}) {
  const tr = translator(locale);
  const to = statement.to === "latest" ? tr("st.latest") : monthLabel(locale, statement.to);
  const closing = balanceText(locale, statement.closingPaisa > 0 ? "OWED" : statement.closingPaisa < 0 ? "ADVANCE" : "SETTLED", statement.closingPaisa);
  return (
    <article className="flex flex-col gap-4" lang={locale}>
      <header className="flex flex-col gap-1 border-b-2 border-foreground pb-3">
        <p className="kicker">{houseName}</p>
        <h1 className="page-title">{statement.owner.displayName}</h1>
        <p className="m-0 font-semibold">
          {tr("print.title")} · {tr("print.share", { percent: percent(locale, statement.owner.sharePercent) })}
        </p>
        <p className="m-0">{tr("print.period", { from: monthLabel(locale, statement.from), to })}</p>
        <p className="muted m-0">{tr("print.generated", { date: formatDateTime(locale, generatedAt) ?? "", name: generatedBy })}</p>
      </header>
      <table className="st-table">
        <thead>
          <tr>
            <th>{tr("st.col.date")}</th>
            <th>{tr("st.col.month")}</th>
            <th>{tr("st.col.type")}</th>
            <th>{tr("st.col.note")}</th>
            <th className="num">{tr("st.col.amount")}</th>
            <th className="num">{tr("st.col.running")}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="st-edge">
            <td colSpan={5}>{tr("st.bf")}</td>
            <td className="num">{formatMoney(locale, statement.broughtForwardPaisa)}</td>
          </tr>
          {statement.rows.length === 0 ? (
            <tr>
              <td colSpan={6}>{tr("st.empty", { from: monthLabel(locale, statement.from), to })}</td>
            </tr>
          ) : null}
          {statement.rows.map((r) => (
            <tr key={r.id} data-void={r.voided ? "true" : undefined}>
              <td>{shortDate(locale, r.date)}</td>
              <td>{monthLabel(locale, r.month)}</td>
              <td>
                {typeLabel(locale, r.type)}
                {r.voided ? ` · ${tr("st.tag.void")}` : ""}
              </td>
              <td className="st-note">
                {[r.note, r.referenceNo, r.referenceMonth ? tr("st.for", { month: monthLabel(locale, r.referenceMonth) }) : null].filter(Boolean).join(" · ")}
              </td>
              <td className="num">{signedMoney(locale, r.amountPaisa)}</td>
              <td className="num">{formatMoney(locale, r.runningPaisa)}</td>
            </tr>
          ))}
          <tr className="st-edge">
            <td colSpan={5}>{tr("st.closing")}</td>
            <td className="num">
              {formatMoney(locale, statement.closingPaisa)} ({closing.word})
            </td>
          </tr>
        </tbody>
      </table>
      {Object.keys(statement.totals).length ? (
        <section className="flex flex-col gap-1">
          <h2 className="m-0 text-base font-extrabold">{tr("st.totals")}</h2>
          <dl className="kv">
            {(Object.entries(statement.totals) as [LedgerType, number][]).map(([type, sum]) => (
              <div key={type} className="contents">
                <dt>{typeLabel(locale, type)}</dt>
                <dd className="font-extrabold tabular-nums">{signedMoney(locale, sum)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      <p className="muted m-0">{tr("st.legend")}</p>
    </article>
  );
}
