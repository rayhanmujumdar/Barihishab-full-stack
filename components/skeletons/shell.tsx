// App-shell skeleton for the (app) layout fallback (loading-skeletons spec,
// design D2). Reuses the real .shell/.sidebar/.topbar/.bottom-nav classes, so
// the 860px breakpoint, 252px sidebar and 60px nav cells cannot drift.
import { translator, type Locale } from "@/lib/i18n";
import { PageSkeletonBody } from "./pages";
import { Skeleton, SkeletonRegion } from "./primitives";

const NAV_ITEMS = 8;
const NAV_CELLS = 5;

export function ShellSkeleton({ locale }: { locale: Locale }) {
  const tr = translator(locale);
  return (
    <SkeletonRegion label={tr("loading.app")} className="shell">
      <div className="sidebar" aria-hidden="true">
        <div className="flex flex-col gap-1">
          <span className="brand-mark" style={{ display: "inline-flex" }}>
            {tr("app.name")}
          </span>
          <Skeleton className="ml-[38px] h-3 w-28" />
        </div>
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {Array.from({ length: NAV_ITEMS }, (_, i) => (
            <li key={i} data-skeleton="nav-item" className="flex min-h-11 items-center gap-2.5 px-3">
              <Skeleton className="size-[18px] flex-none" />
              <Skeleton className="h-3.5 w-28" />
            </li>
          ))}
        </ul>
        <div className="mt-auto flex items-center gap-2.5">
          <span data-skeleton="avatar" aria-hidden="true" className="skeleton block size-9 flex-none" />
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-16" />
          </span>
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="topbar" aria-hidden="true">
          <span className="brand-mark">{tr("app.name")}</span>
          <span className="flex items-center gap-2">
            <Skeleton className="h-11 w-14 sm:w-20" />
            <Skeleton className="h-11 w-24 sm:w-32" />
          </span>
        </div>
        <div className="shell-main">
          <PageSkeletonBody />
        </div>
      </div>
      <div className="bottom-nav" aria-hidden="true">
        {Array.from({ length: NAV_CELLS }, (_, i) => (
          <span key={i} data-skeleton="nav-cell" className="flex min-h-[60px] flex-col items-center justify-center gap-1.5 border-t-4 border-transparent">
            <Skeleton className="size-[22px]" />
            <Skeleton className="h-2.5 w-10" />
          </span>
        ))}
      </div>
    </SkeletonRegion>
  );
}
