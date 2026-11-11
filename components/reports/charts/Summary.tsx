// Screen-reader text for a chart: every plotted value in words, tied to the
// figure with aria-describedby (dataviz: identity and values never by colour alone).
export function ChartSummary({ id, lines }: { id: string; lines: string[] }) {
  return (
    <figcaption id={id} className="sr-only">
      {lines.join("; ")}
    </figcaption>
  );
}
