"use client";

// Categories as horizontal bars (Reports F2.3–F2.4, F10): amount with its share
// of the total as a direct label; income ink, expenses yellow.
import { Bar, BarChart, Cell, LabelList, Tooltip, XAxis, YAxis } from "recharts";
import type { Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { bpPercent } from "../format";
import { useId } from "react";
import { ChartTooltip } from "./ChartTooltip";
import { ChartSummary } from "./Summary";
import { AXIS_TICK, INK, palette, PRINT_WIDTH } from "./theme";

export type CategoryDatum = { key: string; name: string; amountPaisa: number; shareBp: number };

type Props = { locale: Locale; data: CategoryDatum[]; kind: "INCOME" | "EXPENSE"; label: string; print?: boolean; printWidth?: number };

const ROW = 34;

export function CategoryBarChart({ locale, data, kind, label, print = false, printWidth = PRINT_WIDTH }: Props) {
  const summaryId = useId();
  if (!data.length) return null;
  const p = palette(print);
  const fill = kind === "INCOME" ? p.income : p.expense;
  const edge = kind === "INCOME" ? p.income : p.expenseEdge;
  const height = data.length * ROW + 8;
  const size = print ? { width: printWidth, height } : { responsive: true, style: { width: "100%", height } };
  const text = (d: CategoryDatum) => `${formatMoney(locale, d.amountPaisa)} · ${bpPercent(locale, d.shareBp)}`;
  return (
    <figure className="rpt-figure" aria-label={label} aria-describedby={summaryId} data-testid={`rpt-chart-${kind.toLowerCase()}`}>
      <ChartSummary id={summaryId} lines={data.map((d) => `${d.name}: ${text(d)}`)} />
      <BarChart {...size} data={data} layout="vertical" margin={{ top: 4, right: 116, bottom: 4, left: 0 }} barCategoryGap={8} accessibilityLayer={!print}>
        <XAxis type="number" hide domain={[0, "dataMax"]} />
        <YAxis type="category" dataKey="name" width={print ? 120 : 148} tick={{ ...AXIS_TICK, fill: INK }} tickLine={false} axisLine={{ stroke: INK, strokeWidth: 2 }} interval={0} />
        {print ? null : (
          <Tooltip
            cursor={{ fill: "rgba(32,30,29,0.04)" }}
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as CategoryDatum | undefined;
              return d ? <ChartTooltip active={active} title={d.name} rows={[{ name: label, value: text(d), color: fill }]} /> : null;
            }}
          />
        )}
        <Bar dataKey="amountPaisa" isAnimationActive={false} stroke={edge} strokeWidth={1}>
          {data.map((d) => (
            <Cell key={d.key} fill={fill} />
          ))}
          <LabelList dataKey="amountPaisa" position="right" content={({ x, y, width, height: h, index }) => {
            const d = data[index ?? 0];
            return (
              <text x={Number(x) + Number(width) + 6} y={Number(y) + Number(h) / 2} dominantBaseline="central" fontSize={11} fontWeight={800} fill={INK}>
                {text(d)}
              </text>
            );
          }} />
        </Bar>
      </BarChart>
    </figure>
  );
}
