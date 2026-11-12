"use client";

import { MonthComplaintsNote, RaiseObjectionButton } from "@/components/complaints/ComplaintLinks";
import { ChevronLeftIcon, ChevronRightIcon, LockClosedIcon, LockOpenIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PayDrawer } from "@/components/owners/PayDrawer";
import type { PayDrawerData } from "@/components/owners/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { translator, type Locale } from "@/lib/i18n";
import { monthLabel } from "@/lib/periods/month";
import { localePath } from "@/lib/i18n/paths";
import { ChangesTable } from "./ChangesTable";
import { CloseMonthDialog } from "./CloseMonthDialog";
import { distributionHref, formatDay } from "./format";
import { OwnerBoard } from "./OwnerBoard";
import { ReopenDialog } from "./ReopenDialog";
import { ReserveDialog } from "./ReserveDialog";
import { Staircase } from "./Staircase";
import type { BoardRow, DistPerms, DistributionDto, DistributionResult, FundLite } from "./types";

/** The month's period id, its visible open complaints and whether the viewer may raise one (Notices & Complaints C8). */
export type MonthComplaints = { periodId: string; openCount: number; complain: boolean };
type Props = { locale: Locale; data: DistributionResult; perms: DistPerms; funds: FundLite[]; houseFundPaisa: number; complaints?: MonthComplaints };
type Open = { kind: "close" } | { kind: "reopen" } | { kind: "reserve" } | { kind: "pay"; row: BoardRow } | null;

/** Distribution board page (Distribution PRD F1–F5, F7–F9, F12, F15). */
export function DistributionView({ locale, data, perms, funds, houseFundPaisa, complaints }: Props) {
  const tr = translator(locale);
  if (data.month === null) {
    return (
      <div className="page-stack" lang={locale}>
        <h1 className="page-title">{tr("dist.title")}</h1>
        <div className="flex flex-col items-start gap-3 border-t-2 border-foreground pt-4">
          <p className="m-0">{tr("dist.empty.noMonths")}</p>
          {perms.close ? (
            <Button asChild>
              <Link href={localePath(locale, "/settings")}>{tr("dist.empty.finish")}</Link>
            </Button>
          ) : null}
        </div>
      </div>
    );
  }
  return <Board locale={locale} data={data as DistributionDto} perms={perms} funds={funds} houseFundPaisa={houseFundPaisa} complaints={complaints} />;
}

function Board({ locale, data, perms, funds, houseFundPaisa, complaints }: Omit<Props, "data"> & { data: DistributionDto }) {
  const tr = translator(locale);
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const [showChanges, setShowChanges] = useState(false);
  const m = data.month;
  const label = monthLabel(locale, m.key);
  const closed = m.status === "CLOSED";
  const idx = data.months.findIndex((x) => x.key === m.key);
  const newer = idx > 0 ? data.months[idx - 1] : null;
  const older = idx >= 0 && idx < data.months.length - 1 ? data.months[idx + 1] : null;
  const hasOpenMonth = data.months.some((x) => x.status === "OPEN");
  const done = () => {
    setOpen(null);
    router.refresh();
  };
  /** Close and reopen change which month is the default: stay on this one (F5 "switches to the closed view"). */
  const doneHere = () => {
    setOpen(null);
    router.replace(distributionHref(locale, m.key));
    router.refresh();
  };

  const subLine = closed
    ? [m.closedBy && m.closedAt ? tr("dist.subClosed", { name: m.closedBy, date: formatDay(locale, m.closedAt) }) : tr("dist.subClosedLegacy"), m.reopenCount > 0 ? tr("dist.reopened", { n: m.reopenCount }) : null]
        .filter(Boolean)
        .join(" · ")
    : tr("dist.subOpen");

  return (
    <div className="page-stack" lang={locale}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="kicker flex items-center gap-2">
            {label}
            {closed ? (
              <Badge variant="neutral">
                <LockClosedIcon aria-hidden />
                {tr("dist.closedTag")}
              </Badge>
            ) : (
              <Badge variant="accent">{tr("dist.draft")}</Badge>
            )}
          </p>
          <h1 className="page-title">{tr("dist.title")}</h1>
          <p className="muted m-0">{subLine}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!closed && perms.close ? (
            m.mustCloseFirst ? (
              <Link href={distributionHref(locale, m.mustCloseFirst)} className="bal-neg font-semibold">
                {tr("dist.closeFirst", { month: monthLabel(locale, m.mustCloseFirst) })}
              </Link>
            ) : (
              <Button onClick={() => setOpen({ kind: "close" })}>
                <LockClosedIcon data-icon="inline-start" />
                {tr("dist.closeMonth")}
              </Button>
            )
          ) : null}
          {closed && perms.reopen && m.isLatestClosed ? (
            <Button variant="outline" onClick={() => setOpen({ kind: "reopen" })}>
              <LockOpenIcon data-icon="inline-start" />
              {tr("dist.reopen")}
            </Button>
          ) : null}
          {complaints?.complain ? <RaiseObjectionButton locale={locale} type="MONTH" id={complaints.periodId} className="" /> : null}
        </div>
      </div>
      {complaints ? <MonthComplaintsNote locale={locale} month={m.key} count={complaints.openCount} /> : null}

      <div className="flex flex-wrap items-center gap-3">
        <nav className="month-picker" aria-label={tr("dist.pickMonth")}>
          {older ? (
            <Link href={distributionHref(locale, older.key)} aria-label={tr("dist.prev")}>
              <ChevronLeftIcon className="size-5" />
            </Link>
          ) : (
            <span aria-disabled="true">
              <ChevronLeftIcon className="size-5" />
            </span>
          )}
          <span className="month-picker-label">
            {closed ? <LockClosedIcon className="size-4" aria-hidden /> : null}
            {label}
          </span>
          {newer ? (
            <Link href={distributionHref(locale, newer.key)} aria-label={tr("dist.next")}>
              <ChevronRightIcon className="size-5" />
            </Link>
          ) : (
            <span aria-disabled="true">
              <ChevronRightIcon className="size-5" />
            </span>
          )}
        </nav>
        <label className="sr-only" htmlFor="dist-month">
          {tr("dist.jumpMonth")}
        </label>
        <select id="dist-month" className="input min-h-11 border border-[var(--color-divider)] bg-[var(--color-surface)] px-3" value={m.key} onChange={(e) => router.push(distributionHref(locale, e.target.value))}>
          {data.months.map((x) => (
            <option key={x.key} value={x.key}>
              {monthLabel(locale, x.key)} · {tr(x.status === "CLOSED" ? "dist.closedTag" : "dist.draft")}
            </option>
          ))}
        </select>
      </div>

      {closed && perms.reopen && !m.isLatestClosed ? <p className="muted m-0">{tr("dist.reopenOlder")}</p> : null}

      {data.reopens.length ? (
        <div className="lock-banner flex-col" role="note">
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {data.reopens.map((r, i) => (
              <li key={i}>{tr("dist.reopenedNote", { date: formatDay(locale, r.at), name: r.by, reason: r.reason })}</li>
            ))}
          </ul>
          {closed && data.changes ? (
            <>
              <Button variant="link" className="h-auto self-start p-0" aria-expanded={showChanges} onClick={() => setShowChanges((v) => !v)}>
                {tr(showChanges ? "dist.changes.hide" : "dist.changes.see")}
              </Button>
              {showChanges ? <ChangesTable locale={locale} changes={data.changes} /> : null}
            </>
          ) : null}
        </div>
      ) : null}

      <Staircase locale={locale} data={data} onReserve={() => setOpen({ kind: "reserve" })} />

      {data.rows.length === 0 ? (
        <div className="flex flex-col items-start gap-3 border-t-2 border-foreground pt-4">
          <p className="m-0">{tr("dist.empty.noOwners", { month: label })}</p>
          {perms.shares ? (
            <Button asChild>
              <Link href={localePath(locale, "/owners")}>{tr("dist.empty.setShares")}</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <OwnerBoard locale={locale} data={data} canPay={perms.pay && hasOpenMonth} onPay={(row) => setOpen({ kind: "pay", row })} />
      )}

      {open?.kind === "close" ? <CloseMonthDialog locale={locale} month={m.key} onClose={() => setOpen(null)} onDone={doneHere} /> : null}
      {open?.kind === "reopen" ? <ReopenDialog locale={locale} data={data} onClose={() => setOpen(null)} onDone={doneHere} /> : null}
      {open?.kind === "reserve" ? <ReserveDialog locale={locale} data={data} canOverride={perms.override} onClose={() => setOpen(null)} onDone={done} /> : null}
      {open?.kind === "pay" ? <PayDrawer locale={locale} mode="pay" data={payData(open.row, funds, houseFundPaisa)} onClose={() => setOpen(null)} onSaved={done} /> : null}
    </div>
  );
}

/** Pay from the board (F12): the Owners pay drawer, pre-filled with the row's owner and balance. */
function payData(row: BoardRow, funds: FundLite[], houseFundPaisa: number): PayDrawerData {
  return {
    owner: { id: row.ownerId, displayName: row.displayName, balancePaisa: row.balancePaisa, balanceLabel: row.balanceLabel, oldestDueMonth: null },
    funds,
    houseFundPaisa,
  };
}
