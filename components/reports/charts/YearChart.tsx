"use client";

// 12-month income vs expenses (Reports F3.3, F4): income ink, expenses yellow,
// draft months hatched; each month opens its Monthly report. The month row
// under the plot is the accessible, keyboard-reachable version of the chart.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId } from "react";
import { Bar, BarChart, Cell, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { translator, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import type { YearlyReportDto } from "@/lib/reports/dto";
import { monthNarrow, monthShort, reportHref } from "../format";
import { ChartTooltip } from "./ChartTooltip";
import { ChartSummary } from "./Summary";
import { AXIS_TICK, compactMoney, INK, palette, PRINT_WIDTH } from "./theme";

type Datum = { key: string; short: string; narrow: string; income: number | null; expense: number | null; draft: boolean };

const Y_AXIS = 56;
const HEIGHT = 200;

export function YearChart({ locale, data, print = false }: { locale: Locale; data: YearlyReportDto; print?: boolean }) {
  const tr = translator(locale);
  const router = useRouter();
  const uid = useId().replace(/:/g, "");
  const p = palette(print);
  const rows: Datum[] = data.months.map((m) => ({
    key: m.month,
    short: monthShort(locale, m.month),
    narrow: monthNarrow(locale, m.month),
    income: m.figure?.incomePaisa ?? null,
    expense: m.figure?.expensesAllPaisa ?? null,
    draft: m.status === "DRAFT",
  }));
  const href = (key: string) => reportHref(locale, "monthly", { month: key });
  const size = print ? { width: PRINT_WIDTH, height: HEIGHT } : { responsive: true, style: { width: "100%", height: HEIGHT, cursor: "pointer" } };
  const hatch = { income: `rpt-hatch-i-${uid}`, expense: `rpt-hatch-e-${uid}` };
  const fillOf = (kind: "income" | "expense", d: Datum) => (d.draft ? `url(#${hatch[kind]})` : kind === "income" ? p.income : p.expense);
  const open = (d: Datum | undefined) => {
    if (!print && d && d.income !== null) router.push(href(d.key));
  };
  return (
    <figure className="rpt-figure" aria-label={tr("rpt.chart")} aria-describedby={`rpt-sum-${uid}`} data-testid="rpt-chart-year">
      <ChartSummary
        id={`rpt-sum-${uid}`}
        lines={rows
          .filter((d) => d.income !== null)
          .map((d) => `${tr("rpt.chartBar", { month: monthLabel(locale, d.key), income: formatMoney(locale, d.income ?? 0), expenses: formatMoney(locale, d.expense ?? 0) })}${d.draft ? ` (${tr("rpt.draft")})` : ""}`)}
      />
      <BarChart {...size} data={rows} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%" accessibilityLayer={!print}>
        <defs>
          {(["income", "expense"] as const).map((k) => (
            <pattern key={k} id={hatch[k]} patternUnits="userSpaceOnUse" width={5} height={5} patternTransform="rotate(135)">
              <rect width={5} height={5} fill="#f3f2f2" />
              <line x1={0} y1={0} x2={0} y2={5} stroke={k === "income" ? p.income : p.expenseEdge} strokeWidth={2} />
            </pattern>
          ))}
        </defs>
        <XAxis dataKey="short" hide />
        <YAxis width={Y_AXIS} tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v: number) => compactMoney(locale, v)} />
        {print ? null : (
          <Tooltip
            cursor={{ fill: "rgba(32,30,29,0.04)" }}
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as Datum | undefined;
              if (!d || d.income === null) return null;
              return (
                <ChartTooltip
                  active={active}
                  title={`${monthLabel(locale, d.key)}${d.draft ? ` · ${tr("rpt.draft")}` : ""}`}
                  rows={[
                    { name: tr("rpt.income"), value: formatMoney(locale, d.income), color: p.income },
                    { name: tr("rpt.expensesAll"), value: formatMoney(locale, d.expense ?? 0), color: p.expense },
                  ]}
                />
              );
            }}
          />
        )}
        <ReferenceLine y={0} stroke={INK} strokeWidth={2} ifOverflow="extendDomain" />
        <Bar dataKey="income" isAnimationActive={false} onClick={(e) => open(e?.payload as Datum)}>
          {rows.map((d) => (
            <Cell key={d.key} fill={fillOf("income", d)} stroke={d.draft ? p.income : undefined} />
          ))}
        </Bar>
        <Bar dataKey="expense" isAnimationActive={false} onClick={(e) => open(e?.payload as Datum)}>
          {rows.map((d) => (
            <Cell key={d.key} fill={fillOf("expense", d)} stroke={p.expenseEdge} strokeWidth={1} />
          ))}
        </Bar>
      </BarChart>
      <ol className="rpt-chart-months" style={{ paddingLeft: Y_AXIS, width: print ? PRINT_WIDTH : undefined }}>
        {rows.map((d) => (
          <li key={d.key}>
            {d.income !== null && !print ? (
              <Link
                href={href(d.key)}
                data-draft={d.draft ? "true" : undefined}
                aria-label={`${tr("rpt.chartBar", { month: monthLabel(locale, d.key), income: formatMoney(locale, d.income), expenses: formatMoney(locale, d.expense ?? 0) })}${d.draft ? ` · ${tr("rpt.draft")}` : ""}`}
              >
                <MonthText d={d} />
              </Link>
            ) : (
              <span>
                <MonthText d={d} />
              </span>
            )}
          </li>
        ))}
      </ol>
    </figure>
  );
}


/** Short name on wide screens, the initial on phones (CSS picks one). */
function MonthText({ d }: { d: Datum }) {
  return (
    <>
      <span className="rpt-m-short">{d.short}</span>
      <span className="rpt-m-narrow" aria-hidden>
        {d.narrow}
      </span>
    </>
  );
}
