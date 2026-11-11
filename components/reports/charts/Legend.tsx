// HTML legend for charts with two or more series (dataviz: identity never by colour alone).
import { NEUTRAL } from "./theme";

export type LegendItem = { label: string; kind: "INCOME" | "EXPENSE" | "DRAFT" | "REFERENCE" };

export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <span className="rpt-legend">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1">
          {i.kind === "REFERENCE" ? (
            <span className="rpt-swatch-line" style={{ borderColor: NEUTRAL }} aria-hidden />
          ) : (
            <span className="rpt-swatch" data-kind={i.kind === "DRAFT" ? undefined : i.kind} data-draft={i.kind === "DRAFT" ? "true" : undefined} aria-hidden />
          )}
          {i.label}
        </span>
      ))}
    </span>
  );
}
