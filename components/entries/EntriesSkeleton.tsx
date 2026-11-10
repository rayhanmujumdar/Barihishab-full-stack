// S3 loading state: six skeleton rows (Income & Expenses PRD §6.1, LST-01..05),
// under the same head, month picker and Income/Expense tabs as the real list.
import { Skeleton, SkeletonMonthPicker, SkeletonPageHead, SkeletonRegion, SkeletonRows } from "@/components/skeletons/primitives";
import { translator, type Locale } from "@/lib/i18n";

export function EntriesSkeleton({ locale }: { locale: Locale }) {
  return (
    <SkeletonRegion label={translator(locale)("entries.loading")} className="page-stack">
      <SkeletonPageHead action />
      <SkeletonMonthPicker />
      <section className="flex flex-col gap-4">
        <div className="entry-tabs">
          <span className="flex flex-col gap-2 p-3 pl-0">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-32" />
          </span>
          <span className="flex flex-col gap-2 p-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-32" />
          </span>
        </div>
        <SkeletonRows rows={6} meta />
      </section>
    </SkeletonRegion>
  );
}
