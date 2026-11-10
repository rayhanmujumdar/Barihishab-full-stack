// Skeleton bodies for overlays that fetch on open (loading-skeletons spec, D7).
// Client components render these inline; they hold no state of their own.
import { translator, type Locale } from "@/lib/i18n";
import { Skeleton, SkeletonRegion, SkeletonRows, SkeletonSectionHead } from "./primitives";

type Props = { locale: Locale };

/** Entry Detail drawer body: amount, tags, key/value rows, files and history. */
export function DetailDrawerSkeleton({ locale }: Props) {
  return (
    <SkeletonRegion label={translator(locale)("loading.entry")} className="form-stack">
      <Skeleton className="h-11 w-48" />
      <span className="flex gap-1.5">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-16" />
      </span>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="grid grid-cols-[120px_1fr] gap-3">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-3/4" />
          </span>
        ))}
      </div>
      <section className="flex flex-col gap-3">
        <SkeletonSectionHead />
        <span className="flex gap-2">
          <Skeleton className="size-20" />
          <Skeleton className="size-20" />
        </span>
      </section>
      <section className="flex flex-col gap-2">
        <SkeletonSectionHead />
        <SkeletonRows rows={2} meta />
      </section>
    </SkeletonRegion>
  );
}

/** Close-month dialog: must-pass checks list, then the "what happens" list. */
export function ClosePreviewSkeleton({ locale }: Props) {
  const line = (key: number) => (
    <li key={key} className="flex items-center gap-2">
      <Skeleton className="size-5 flex-none" />
      <Skeleton className="h-4 w-3/4" />
    </li>
  );
  return (
    <SkeletonRegion label={translator(locale)("dist.close.loading")} className="form-stack">
      <section>
        <Skeleton className="mb-2 h-3 w-28" />
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">{[0, 1, 2, 3].map(line)}</ul>
      </section>
      <section>
        <Skeleton className="mb-2 h-3 w-32" />
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {[0, 1, 2].map((i) => (
            <li key={i}>
              <Skeleton className="h-3.5 w-2/3" />
            </li>
          ))}
        </ul>
      </section>
    </SkeletonRegion>
  );
}

/** Generate-rent dialog: date field, ruled unit rows with fund + amount, total. */
export function RentPreviewSkeleton({ locale }: Props) {
  return (
    <SkeletonRegion label={translator(locale)("loading.rentPreview")} className="flex flex-col gap-4">
      <span className="flex flex-col gap-1.5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-11 w-full" />
      </span>
      <ul className="m-0 list-none border-t-2 border-foreground p-0">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="list-row min-h-11 flex-wrap">
            <span className="flex min-w-0 flex-1 items-center gap-2.5">
              <Skeleton className="size-[18px] flex-none" />
              <span className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-28" />
              </span>
            </span>
            <Skeleton className="h-11 w-40" />
            <Skeleton className="h-11 w-[140px]" />
          </li>
        ))}
      </ul>
      <span className="flex justify-between">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-7 w-28" />
      </span>
    </SkeletonRegion>
  );
}
