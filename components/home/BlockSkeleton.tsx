import { translator, type Locale } from "@/lib/i18n";
import { blockLabel, type HomeBlockName } from "./format";

/** Placeholder while one Home block streams in (F11). */
export function BlockSkeleton({ locale, block, rows = 2 }: { locale: Locale; block: HomeBlockName; rows?: number }) {
  return (
    <div role="status" className="flex flex-col gap-3 border-t-2 border-foreground pt-3" aria-busy="true" aria-label={translator(locale)("home.loading", { block: blockLabel(locale, block) })}>
      <div className="skeleton h-3 w-28" />
      <div className="skeleton h-9 w-3/4 max-w-80" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-4 w-1/2" />
      ))}
    </div>
  );
}
