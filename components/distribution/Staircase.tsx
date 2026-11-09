import Link from "next/link";
import { percent } from "@/components/owners/format";
import { translator, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import { distributionHref, entriesHref } from "./format";
import type { DistributionDto } from "./types";

/** "5% of ৳89,020" / "Fixed ৳10,000 a month" / "Reserve is off" / the override reason (F9). */
export function reserveRuleText(locale: Locale, d: DistributionDto): string {
  const tr = translator(locale);
  const { staircase: s, reserve } = d;
  if (s.reserveSource === "OVERRIDE") return tr("dist.rule.override", { reason: reserve.overrideReason ?? "" });
  if (reserve.rule.mode === "OFF") return tr("dist.rule.OFF");
  if (s.surplusPaisa <= 0) return tr("dist.rule.noSurplus");
  if (reserve.rule.mode === "PERCENT") return tr("dist.rule.PERCENT", { percent: percent(locale, (reserve.rule.percentBp ?? 0) / 100), surplus: formatMoney(locale, s.surplusPaisa) });
  return tr("dist.rule.FIXED", { amount: formatMoney(locale, reserve.rule.fixedPaisa ?? 0) });
}

function Cell({ label, op, value, hint }: { label: string; op?: string; value: string; hint?: string }) {
  return (
    <>
      <span className="stair-label">
        <span className="kicker">{label}</span>
        {op ? (
          <span className="stair-op" aria-hidden>
            {op}
          </span>
        ) : null}
      </span>
      <span className="stat-value">{value}</span>
      {hint ? <span className="muted">{hint}</span> : null}
    </>
  );
}

/** Income − Expense − Reserve − Previous deficit = Distributable (F2, F10). */
export function Staircase({ locale, data, onReserve }: { locale: Locale; data: DistributionDto; onReserve: () => void }) {
  const tr = translator(locale);
  const s = data.staircase;
  const month = data.month.key;
  const money = (p: number) => formatMoney(locale, p);
  return (
    <section aria-labelledby="stair-title">
      <h2 id="stair-title" className="sr-only">
        {tr("dist.staircase")}
      </h2>
      <div className="stair">
        <Link className="stair-cell" href={entriesHref(locale, month, "INCOME")} aria-label={`${tr("dist.income")} ${money(s.incomePaisa)} · ${tr("dist.openEntries")}`}>
          <Cell label={tr("dist.income")} value={money(s.incomePaisa)} />
        </Link>
        <Link className="stair-cell" href={entriesHref(locale, month, "EXPENSE")} aria-label={`${tr("dist.expense")} ${money(s.expensePaisa)} · ${tr("dist.openEntries")}`}>
          <Cell label={tr("dist.expense")} op="−" value={money(s.expensePaisa)} />
        </Link>
        <button type="button" className="stair-cell" onClick={onReserve} aria-label={`${tr("dist.reserve")} ${money(s.reservePaisa)} · ${tr("dist.reserveDetails")}`}>
          <Cell label={tr("dist.reserve")} op="−" value={money(s.reservePaisa)} hint={reserveRuleText(locale, data)} />
        </button>
        {s.previousDeficitPaisa > 0 && s.previousDeficitMonth ? (
          <Link className="stair-cell" href={distributionHref(locale, s.previousDeficitMonth)}>
            <Cell label={tr("dist.prevDeficit")} op="−" value={money(s.previousDeficitPaisa)} hint={tr("dist.deficitFrom", { month: monthLabel(locale, s.previousDeficitMonth) })} />
          </Link>
        ) : (
          <div className="stair-cell">
            <Cell label={tr("dist.prevDeficit")} op="−" value={money(s.previousDeficitPaisa)} />
          </div>
        )}
        <div className="stair-cell stair-total" data-testid="distributable">
          <Cell label={tr("dist.distributable")} op="=" value={money(s.distributablePaisa)} />
        </div>
      </div>
      {s.deficitCarriedPaisa > 0 || s.reserveSpentPaisa > 0 || s.reserveSource === "OVERRIDE" ? (
        <ul className="stair-notes">
          {s.deficitCarriedPaisa > 0 ? <li className="bal-neg font-semibold">{tr("dist.note.deficit", { amount: money(s.deficitCarriedPaisa) })}</li> : null}
          {s.reserveSpentPaisa > 0 ? <li className="muted">{tr("dist.note.reserveSpent", { amount: money(s.reserveSpentPaisa) })}</li> : null}
          {s.reserveSource === "OVERRIDE" ? <li className="muted">{tr("dist.note.override", { amount: money(s.reservePaisa), reason: data.reserve.overrideReason ?? "" })}</li> : null}
        </ul>
      ) : null}
    </section>
  );
}
