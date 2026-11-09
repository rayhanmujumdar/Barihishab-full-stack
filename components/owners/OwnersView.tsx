"use client";

import { useState } from "react";
import { ArrowRightIcon, ClockIcon, PlusIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { translator, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import { cn } from "@/lib/utils";
import { ChangeSharesDialog } from "./ChangeSharesDialog";
import { balanceText, balanceTone, ownerHref, percent } from "./format";
import { OwnerFormDialog } from "./OwnerFormDialog";
import type { OwnerDto, OwnersData } from "./types";

type Open = "shares" | "add" | "timeline" | null;

/** Owners list (Owners PRD F1, F5, F9). */
export function OwnersView({ locale, data }: { locale: Locale; data: OwnersData }) {
  const tr = translator(locale);
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const { list } = data;

  return (
    <div className="page-stack" lang={locale}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">{tr("owners.kicker", { house: list.houseName, units: list.totalUnits })}</p>
          <h1 className="page-title">{tr("owners.title")}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setOpen("timeline")}>
            <ClockIcon data-icon="inline-start" />
            {tr("owners.timeline")}
          </Button>
          {data.perms.manage && list.owners.length ? (
            <Button variant="outline" onClick={() => setOpen("add")}>
              <PlusIcon data-icon="inline-start" />
              {tr("owners.addOwner")}
            </Button>
          ) : null}
          {data.perms.shares && list.owners.length ? <Button onClick={() => setOpen("shares")}>{tr("owners.changeShares")}</Button> : null}
        </div>
      </div>

      {list.owners.length === 0 ? (
        <div className="flex flex-col items-start gap-3 border-t-2 border-foreground pt-4">
          <p className="m-0">{tr("owners.empty")}</p>
          {data.perms.manage ? (
            <Button onClick={() => setOpen("add")}>
              <PlusIcon data-icon="inline-start" />
              {tr("owners.addOwner")}
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="owner-grid" aria-label={tr("owners.list")}>
          {list.owners.map((o) => (
            <li key={o.id} data-viewer={o.isViewer ? "true" : undefined}>
              <OwnerCard locale={locale} owner={o} />
            </li>
          ))}
        </ul>
      )}

      {list.formerOwners.length ? (
        <section aria-labelledby="former-title" className="flex flex-col">
          <div className="section-head">
            <h2 id="former-title">{tr("owners.former")}</h2>
          </div>
          <ul className="m-0 list-none p-0">
            {list.formerOwners.map((o) => {
              const bal = balanceText(locale, o.balanceLabel, o.balancePaisa);
              return (
                <li key={o.id}>
                  <Link href={ownerHref(locale, o.id)} className="list-row text-foreground no-underline hover:bg-[var(--color-neutral-200)]">
                    <span className="flex flex-col">
                      <span className="font-bold">{o.displayName}</span>
                      <span className="muted">{tr("owners.former.left", { month: o.leftMonth ? monthLabel(locale, o.leftMonth) : "" })}</span>
                    </span>
                    <span className={cn("bal", `bal-${balanceTone(o.balancePaisa)}`)}>
                      {bal.word} {bal.amount}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <Sheet open={open === "timeline"} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto border-l-2 border-foreground bg-background p-0 sm:max-w-[540px]" aria-describedby={undefined}>
          <SheetHeader className="border-b-2 border-foreground px-5 py-4">
            <SheetTitle className="text-[22px] font-extrabold tracking-[-0.015em]">{tr("owners.timeline")}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-6 p-5" lang={locale}>
            {data.timeline.length === 0 ? <p className="m-0">{tr("owners.timeline.empty")}</p> : null}
            {data.timeline.map((s) => (
              <section key={s.id} className="flex flex-col gap-2 border-t-2 border-foreground pt-3" data-replaced={s.replaced ? "true" : undefined}>
                <div className="flex items-center gap-2">
                  <h3 className="m-0 text-lg font-extrabold">{tr("owners.timeline.from", { month: monthLabel(locale, s.effectiveMonth) })}</h3>
                  {s.replaced ? <Badge variant="neutral">{tr("owners.timeline.replaced")}</Badge> : null}
                </div>
                <p className="muted m-0">{tr("owners.timeline.by", { reason: s.reason, name: s.savedBy })}</p>
                <ul className="m-0 list-none p-0">
                  {s.items.map((i) => (
                    <li key={i.ownerId} className="list-row py-2">
                      <span>{i.displayName}</span>
                      <span className="font-bold tabular-nums">
                        {tr("owners.tag.units", { n: i.units })} · {percent(locale, i.sharePercent)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {open === "shares" ? (
        <ChangeSharesDialog
          locale={locale}
          data={data}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            router.refresh();
          }}
        />
      ) : null}
      {open === "add" ? (
        <OwnerFormDialog
          locale={locale}
          users={data.linkableUsers}
          onClose={() => setOpen(null)}
          onSaved={() => router.refresh()}
          onGiveShares={() => setOpen("shares")}
        />
      ) : null}
    </div>
  );
}

function OwnerCard({ locale, owner: o }: { locale: Locale; owner: OwnerDto }) {
  const tr = translator(locale);
  const bal = balanceText(locale, o.balanceLabel, o.balancePaisa);
  return (
    <Link href={ownerHref(locale, o.id)} className="owner-card">
      <span className="flex items-start gap-3">
        <span className="owner-avatar" aria-hidden="true">
          {o.initials}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="m-0 line-clamp-2 text-lg leading-tight font-extrabold tracking-[-0.015em] break-words">{o.displayName}</h2>
          {o.responsibility ? <span className="muted truncate">{o.responsibility}</span> : null}
        </span>
        <span className="owner-share">{percent(locale, o.sharePercent)}</span>
      </span>
      <span className="flex flex-wrap gap-1.5">
        {o.isViewer ? <Badge className="bg-signal text-foreground">{tr("owners.tag.you")}</Badge> : null}
        {o.tags.superAdmin ? <Badge variant="outline">{tr("owners.tag.superAdmin")}</Badge> : null}
        {o.tags.invitePending ? <Badge variant="accent">{tr("owners.tag.invite")}</Badge> : null}
        {o.tags.noLogin ? <Badge variant="neutral">{tr("owners.tag.noLogin")}</Badge> : null}
        <Badge variant="outline">{tr("owners.tag.units", { n: o.units })}</Badge>
      </span>
      <span className="owner-card-foot">
        <span className="owner-figures">
          <span className="flex flex-col">
            <span className="kicker">{bal.word}</span>
            <span className={cn("owner-figure owner-figure-lead", `bal-${balanceTone(o.balancePaisa)}`)}>{bal.amount || formatMoney(locale, 0)}</span>
          </span>
          <span className="flex flex-col text-right">
            <span className="kicker">{tr("owners.loan")}</span>
            <span className="owner-figure">{o.loanOutstandingPaisa ? formatMoney(locale, o.loanOutstandingPaisa) : tr("owners.loan.none")}</span>
          </span>
        </span>
        <ArrowRightIcon className="owner-card-arrow size-4" aria-hidden />
      </span>
    </Link>
  );
}
