"use client";

// Money in vs money out per fund account (Reports F11): in = income + loan
// repayments (ink), out = expenses + owner payments + loans (yellow).
import { Bar, BarChart, Tooltip, XAxis, YAxis } from "recharts";
import { translator, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import type { FundsReportDto } from "@/lib/reports/dto";
import { useId } from "react";
import { ChartTooltip } from "./ChartTooltip";
import { ChartSummary } from "./Summary";
import { AXIS_TICK, compactMoney, INK, palette, PRINT_WIDTH } from "./theme";

const HEIGHT = 200;

export function FundsChart({ locale, data, label, print = false }: { locale: Locale; data: FundsReportDto; label: string; print?: boolean }) {
  const tr = translator(locale);
  const summaryId = useId();
  const p = palette(print);
  const rows = data.rows.map((r) => ({
    key: r.fundAccountId,
    name: r.name.length > 18 ? `${r.name.slice(0, 17)}…` : r.name,
    fullName: r.name,
    in: r.incomePaisa + r.loanRepaymentsPaisa,
    out: r.expensesPaisa + r.ownerPaymentsPaisa + r.loansOutPaisa,
  }));
  if (!rows.length) return null;
  const size = print ? { width: PRINT_WIDTH, height: HEIGHT } : { responsive: true, style: { width: "100%", height: HEIGHT } };
  return (
    <figure className="rpt-figure" aria-label={label} aria-describedby={summaryId} data-testid="rpt-chart-funds">
      <ChartSummary id={summaryId} lines={rows.map((r) => `${r.fullName}: ${tr("rpt.chart.in")} ${formatMoney(locale, r.in)}, ${tr("rpt.chart.out")} ${formatMoney(locale, r.out)}`)} />
      <BarChart {...size} data={rows} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} barGap={2} barCategoryGap="30%" accessibilityLayer={!print}>
        <XAxis dataKey="name" tick={{ ...AXIS_TICK, fill: INK }} tickLine={false} axisLine={{ stroke: INK, strokeWidth: 2 }} interval={0} />
        <YAxis width={56} tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v: number) => compactMoney(locale, v)} />
        {print ? null : (
          <Tooltip
            cursor={{ fill: "rgba(32,30,29,0.04)" }}
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as (typeof rows)[number] | undefined;
              return d ? (
                <ChartTooltip
                  active={active}
                  title={d.fullName}
                  rows={[
                    { name: tr("rpt.chart.in"), value: formatMoney(locale, d.in), color: p.income },
                    { name: tr("rpt.chart.out"), value: formatMoney(locale, d.out), color: p.expense },
                  ]}
                />
              ) : null;
            }}
          />
        )}
        <Bar dataKey="in" fill={p.income} isAnimationActive={false} maxBarSize={40} />
        <Bar dataKey="out" fill={p.expense} stroke={p.expenseEdge} strokeWidth={1} isAnimationActive={false} maxBarSize={40} />
      </BarChart>
    </figure>
  );
}
