"use client";

// One measure per month as bars, optionally with a reference line on the same
// axis (Reports F9 collected vs expected rent, F10 expense trend). Single axis.
import { Bar, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import type { Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import { monthNarrow, monthShort } from "../format";
import { useNarrow } from "./use-narrow";
import { useId } from "react";
import { ChartTooltip, type TooltipRow } from "./ChartTooltip";
import { ChartSummary } from "./Summary";
import { AXIS_TICK, compactMoney, INK, NEUTRAL, palette, PRINT_WIDTH } from "./theme";

export type MonthDatum = { key: string; value: number | null; reference?: number | null };

type Props = {
  locale: Locale;
  data: MonthDatum[];
  kind: "INCOME" | "EXPENSE";
  label: string;
  valueName: string;
  referenceName?: string;
  print?: boolean;
  testId?: string;
};

const HEIGHT = 180;

export function MonthBarChart({ locale, data, kind, label, valueName, referenceName, print = false, testId }: Props) {
  const p = palette(print);
  const fill = kind === "INCOME" ? p.income : p.expense;
  const edge = kind === "INCOME" ? p.income : p.expenseEdge;
  const summaryId = useId();
  const narrow = useNarrow() && !print;
  const rows = data.map((d) => ({ ...d, short: narrow ? monthNarrow(locale, d.key) : monthShort(locale, d.key) }));
  const size = print ? { width: PRINT_WIDTH, height: HEIGHT } : { responsive: true, style: { width: "100%", height: HEIGHT } };
  const hasRef = referenceName !== undefined && rows.some((r) => r.reference != null);
  return (
    <figure className="rpt-figure" aria-label={label} aria-describedby={summaryId} data-testid={testId}>
      <ChartSummary
        id={summaryId}
        lines={data
          .filter((d) => d.value !== null || d.reference != null)
          .map((d) => `${monthLabel(locale, d.key)}: ${valueName} ${formatMoney(locale, d.value ?? 0)}${referenceName && d.reference != null ? `, ${referenceName} ${formatMoney(locale, d.reference)}` : ""}`)}
      />
      <ComposedChart {...size} data={rows} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} barCategoryGap="24%" accessibilityLayer={!print}>
        <XAxis dataKey="short" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: INK, strokeWidth: 2 }} interval={0} />
        <YAxis width={56} tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v: number) => compactMoney(locale, v)} />
        {print ? null : (
          <Tooltip
            cursor={{ fill: "rgba(32,30,29,0.04)" }}
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as MonthDatum | undefined;
              if (!d || (d.value === null && d.reference == null)) return null;
              const items: TooltipRow[] = [{ name: valueName, value: formatMoney(locale, d.value ?? 0), color: fill }];
              if (hasRef && d.reference != null) items.push({ name: referenceName!, value: formatMoney(locale, d.reference), color: NEUTRAL });
              return <ChartTooltip active={active} title={monthLabel(locale, d.key)} rows={items} />;
            }}
          />
        )}
        <Bar dataKey="value" fill={fill} stroke={edge} strokeWidth={kind === "EXPENSE" ? 1 : 0} isAnimationActive={false} />
        {hasRef ? <Line dataKey="reference" type="step" stroke={NEUTRAL} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 4, fill: NEUTRAL, strokeWidth: 0 }} connectNulls={false} isAnimationActive={false} /> : null}
      </ComposedChart>
    </figure>
  );
}
