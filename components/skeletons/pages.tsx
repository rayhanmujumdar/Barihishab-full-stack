// One loading skeleton per screen (loading-skeletons spec, design D4).
// Built only from primitives and the pages' own layout classes, so the swap
// to real content keeps the head, rules and grids in place.
import type { ReactNode } from "react";
import { translator, type Locale, type MessageKey } from "@/lib/i18n";
import {
  Skeleton,
  SkeletonCardList,
  SkeletonField,
  SkeletonMonthPicker,
  SkeletonOwnerGrid,
  SkeletonPageHead,
  SkeletonRegion,
  SkeletonRows,
  SkeletonSectionHead,
  SkeletonStats,
  SkeletonTable,
  SkeletonTabs,
} from "./primitives";

type Props = { locale: Locale };

function Page({ locale, label, children }: Props & { label: MessageKey; children: ReactNode }) {
  return (
    <SkeletonRegion label={translator(locale)(label)} className="page-stack">
      {children}
    </SkeletonRegion>
  );
}

/** Generic page body: head + rows. The shell skeleton nests it under its own region. */
export function PageSkeletonBody() {
  return (
    <div className="page-stack">
      <SkeletonPageHead />
      <section>
        <SkeletonSectionHead />
        <SkeletonRows rows={5} />
      </section>
    </div>
  );
}

/** Generic page skeleton for screens without a dedicated one. */
export function PageSkeleton({ locale }: Props) {
  return (
    <SkeletonRegion label={translator(locale)("common.loading")}>
      <PageSkeletonBody />
    </SkeletonRegion>
  );
}

/** Home wrapper (Home PRD F10/F11): greeting head, hero + this-month pair, house, feed. */
export function HomeSkeleton({ locale }: Props) {
  return (
    <SkeletonRegion label={translator(locale)("loading.home")} className="home">
      <div className="home-block">
        <SkeletonPageHead action />
      </div>
      <div className="home-pair">
        <div className="home-block home-hero">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-16 w-64 max-w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <div className="home-block">
          <SkeletonSectionHead />
          <SkeletonRows rows={3} />
        </div>
      </div>
      <div className="home-block">
        <SkeletonSectionHead />
        <SkeletonStats cells={4} />
      </div>
      <div className="home-block">
        <SkeletonSectionHead />
        <SkeletonRows rows={4} meta />
      </div>
    </SkeletonRegion>
  );
}

/** Owners list (owners-ui): head with actions, owner-card grid, former owners rows. */
export function OwnersSkeleton({ locale }: Props) {
  return (
    <Page locale={locale} label="owners.loading">
      <SkeletonPageHead action />
      <SkeletonOwnerGrid cards={4} />
      <section className="flex flex-col">
        <SkeletonSectionHead />
        <SkeletonRows rows={2} meta />
      </section>
    </Page>
  );
}

/** Owner detail: back link, head, 5 stats, statement table, loans rows. */
export function OwnerDetailSkeleton({ locale }: Props) {
  return (
    <Page locale={locale} label="loading.owner">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-11 w-24" />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-start gap-3">
            <Skeleton className="size-12 flex-none" />
            <SkeletonPageHead sub />
          </div>
          <span className="flex gap-2">
            <Skeleton className="h-11 w-28" />
            <Skeleton className="h-11 w-28" />
          </span>
        </div>
      </div>
      <SkeletonStats cells={5} />
      <section className="flex flex-col gap-3">
        <SkeletonSectionHead />
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-11 w-36" />
          <Skeleton className="h-11 w-36" />
        </div>
        <SkeletonTable cols={5} rows={6} />
      </section>
    </Page>
  );
}

/** Distribution board: head + close action, month picker, staircase, owner board. */
export function DistributionSkeleton({ locale }: Props) {
  return (
    <Page locale={locale} label="loading.distribution">
      <SkeletonPageHead action sub />
      <div className="flex flex-wrap items-center gap-3">
        <SkeletonMonthPicker />
        <Skeleton className="h-11 w-36" />
      </div>
      <section>
        <div className="stair">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="stair-cell">
              <span className="stair-label">
                <Skeleton className="h-3 w-20" />
              </span>
              <Skeleton className="h-7 w-24 max-w-full" />
            </div>
          ))}
        </div>
      </section>
      <section className="flex flex-col">
        <SkeletonSectionHead />
        <SkeletonTable cols={7} rows={4} minWidth={980} />
      </section>
    </Page>
  );
}

/** Advances & loans: head, 4 tiles, tabs, 2-col filters, stacked loan cards. */
export function AdvancesSkeleton({ locale }: Props) {
  return (
    <Page locale={locale} label="loading.advances">
      <SkeletonPageHead action />
      <SkeletonStats cells={4} />
      <SkeletonTabs tabs={3} />
      <div className="grid-2">
        <SkeletonField />
        <SkeletonField />
      </div>
      <SkeletonCardList cards={2} />
    </Page>
  );
}

/** Requests: head + new-request action, role tabs on the ink rule, stacked cards. */
export function RequestsSkeleton({ locale }: Props) {
  return (
    <Page locale={locale} label="loading.requests">
      <SkeletonPageHead action />
      <SkeletonTabs tabs={3} />
      <SkeletonCardList cards={3} />
    </Page>
  );
}

/** Users: head + invite action, search toolbar, 6-column table. */
export function UsersSkeleton({ locale }: Props) {
  return (
    <Page locale={locale} label="loading.users">
      <SkeletonPageHead action />
      <div className="toolbar">
        <Skeleton className="h-11 w-full max-w-80" />
      </div>
      <SkeletonTable cols={6} rows={6} minWidth={860} />
    </Page>
  );
}

/** Settings › master data: head, then units / funds / categories sections. */
export function SettingsSkeleton({ locale }: Props) {
  return (
    <Page locale={locale} label="loading.settings">
      <SkeletonPageHead />
      {[3, 2, 4].map((rows, i) => (
        <section key={i}>
          <SkeletonSectionHead action />
          <SkeletonRows rows={rows} meta />
        </section>
      ))}
    </Page>
  );
}

/** Profile (/me): profile fields, security, sessions. */
export function ProfileSkeleton({ locale }: Props) {
  return (
    <Page locale={locale} label="loading.profile">
      <SkeletonPageHead />
      <section className="flex flex-col gap-4">
        <SkeletonSectionHead />
        <Skeleton className="size-20" />
        <div className="grid-2">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonField key={i} />
          ))}
        </div>
        <Skeleton className="h-12 w-40" />
      </section>
      <section className="flex flex-col gap-4">
        <SkeletonSectionHead />
        <div className="grid-2">
          <SkeletonField />
          <SkeletonField />
        </div>
      </section>
      <section>
        <SkeletonSectionHead />
        <SkeletonRows rows={2} meta />
      </section>
    </Page>
  );
}

/** Login / forgot / invite / reset: heading, two fields, full-width CTA. */
export function AuthFormSkeleton({ locale }: Props) {
  return (
    <SkeletonRegion label={translator(locale)("loading.form")} className="form-stack">
      <SkeletonPageHead />
      <SkeletonField />
      <SkeletonField />
      <Skeleton className="h-12 w-full" />
    </SkeletonRegion>
  );
}

/** Owner / loan statement print view: header block + table. */
export function StatementPrintSkeleton({ locale }: Props) {
  return (
    <SkeletonRegion label={translator(locale)("loading.statement")} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-4 w-56 max-w-full" />
      </div>
      <SkeletonTable cols={5} rows={8} />
    </SkeletonRegion>
  );
}
