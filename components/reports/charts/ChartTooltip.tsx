"use client";

// Hover tooltip for report charts: surface panel, ink top rule, zero radius;
// text in ink (never the series colour), a square swatch carries identity.
import type { TooltipContentProps } from "recharts";

export type TooltipRow = { name: string; value: string; color: string };

export function ChartTooltip({ active, title, rows }: { active?: boolean; title: string; rows: TooltipRow[] }) {
  if (!active || !rows.length) return null;
  return (
    <div className="rpt-tooltip">
      <p className="rpt-tooltip-title">{title}</p>
      <ul>
        {rows.map((r) => (
          <li key={r.name}>
            <span className="rpt-swatch" style={{ background: r.color }} aria-hidden />
            <span>{r.name}</span>
            <span className="font-extrabold">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type ContentProps = TooltipContentProps<number, string>;
