"use client";

import { useEffect, useState } from "react";
import { EllipsisHorizontalIcon, PlusIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SelectField } from "@/components/forms/fields";
import { num } from "@/components/owners/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/api/client";
import { translator, type Locale, type MessageKey } from "@/lib/i18n";
import { PAGE_SIZE } from "@/lib/requests/page-size";
import { cn } from "@/lib/utils";
import { ApproveDialog, DisburseDialog, ReasonDialog } from "./DecisionDialogs";
import { requestsHref } from "./format";
import { RequestCard, type RequestOpen } from "./RequestCard";
import { RequestDetailSheet } from "./RequestDetailSheet";
import { RequestFormDialog } from "./RequestFormDialog";
import type { RequestDto, RequestsPageData, RequestStatus, RequestTab, RequestType } from "./types";

const TYPES: RequestType[] = ["ADVANCE", "LOAN", "GRANT"];
const HISTORY: RequestStatus[] = ["DISBURSED", "REJECTED", "CANCELLED", "WITHDRAWN"];

/** The active tab's content; the tab itself is the title. */
function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section aria-label={label} className="flex flex-col gap-4">
      {children}
    </section>
  );
}

/** Requests screen (Requests PRD F1, F12): decision queue for the Super Admin, own + paid out for owners. */
export function RequestsView({ locale, data }: { locale: Locale; data: RequestsPageData }) {
  const tr = translator(locale);
  const router = useRouter();
  const [open, setOpen] = useState<RequestOpen>(null);
  const { list, perms, filters, tab } = data;
  const base = { tab, owner: filters.owner, type: filters.type, status: filters.status, year: filters.year, limit: filters.limit };
  const go = (q: Partial<typeof base> & { request?: string | null }) => router.replace(requestsHref(locale, { ...base, ...q }), { scroll: false });
  // Filters start from the first page again; "Show older" grows it.
  const filter = (q: Partial<typeof base>) => go({ ...q, limit: null });
  const older = () => go({ limit: (filters.limit ?? PAGE_SIZE) + PAGE_SIZE });
  const unseen = list.scope === "own" && list.mine.some((r) => r.unseen);
  // Seeing the list clears the badge (design D11) — an explicit write, never a side effect of a read.
  useEffect(() => {
    if (!unseen) return;
    void apiFetch("/requests/seen", { method: "POST" }).then((res) => res.ok && router.refresh());
  }, [unseen, router]);
  const done = () => {
    setOpen(null);
    router.refresh();
  };
  // F1: the Super Admin's sections and the owner's sections each live on their own tab.
  const tabs: { id: RequestTab; label: MessageKey; count?: number }[] =
    list.scope === "all"
      ? [
          { id: "decide", label: "req.section.decide", count: list.pending.length },
          { id: "approved", label: "req.section.approved", count: list.approved.length },
          { id: "history", label: "req.section.history" },
        ]
      : [
          { id: "mine", label: "req.section.mine", count: list.mine.filter((r) => r.unseen).length },
          { id: "paid", label: "req.section.paid" },
        ];
  const canAsk = perms.create && (data.ownOwnerId !== null || perms.record);
  const startNew = () => setOpen({ kind: data.ownOwnerId ? "new" : "record" });

  const cards = (rows: RequestDto[], label: string) => (
    <ul className="m-0 flex list-none flex-col gap-4 p-0" aria-label={label}>
      {rows.map((r) => (
        <li key={r.id}>
          <RequestCard locale={locale} request={r} perms={perms} openMonth={data.openMonth} context={data.contexts[r.id]} onOpen={() => go({ request: r.id })} onAction={setOpen} />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="page-stack" lang={locale}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">{tr("req.kicker")}</p>
          <h1 className="page-title">{tr("req.title")}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAsk ? (
            <Button onClick={startNew}>
              <PlusIcon data-icon="inline-start" />
              {tr("req.new")}
            </Button>
          ) : null}
          {perms.record ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label={tr("req.more")}>
                  <EllipsisHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52 rounded-none border-2 border-foreground">
                <DropdownMenuItem onSelect={() => setOpen({ kind: "record" })}>{tr("req.recordFor")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      <nav aria-label={tr("req.tabs")} className="flex flex-wrap gap-1 border-b-2 border-foreground">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={requestsHref(locale, { tab: t.id })}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 px-3 py-2 font-semibold text-foreground no-underline",
              tab === t.id ? "bg-[var(--signal)]" : "hover:bg-[var(--color-neutral-200)]",
            )}
          >
            {tr(t.label)}
            {t.count ? <Badge className="rounded-none bg-foreground text-background">{num(locale, t.count)}</Badge> : null}
          </Link>
        ))}
      </nav>

      {list.scope === "all" && tab === "decide" ? (
        <Panel label={tr("req.section.decide")}>
          {list.pending.length ? cards(list.pending, tr("req.section.decide")) : <p className="m-0">{tr("req.empty.decide")}</p>}
        </Panel>
      ) : null}
      {list.scope === "all" && tab === "approved" ? (
        <Panel label={tr("req.section.approved")}>
          {list.approved.length ? cards(list.approved, tr("req.section.approved")) : <p className="m-0">{tr("req.empty.approved")}</p>}
        </Panel>
      ) : null}
      {list.scope === "all" && tab === "history" ? (
        <Panel label={tr("req.section.history")}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField
              id="req-f-owner"
              label={tr("req.filter.owner")}
              value={filters.owner}
              onChange={(e) => filter({ owner: e.target.value })}
              options={[{ value: "", label: tr("req.filter.all") }, ...data.owners.map((o) => ({ value: o.id, label: o.name }))]}
            />
            <SelectField
              id="req-f-type"
              label={tr("req.form.type")}
              value={filters.type}
              onChange={(e) => filter({ type: e.target.value as RequestType | "" })}
              options={[{ value: "", label: tr("req.filter.all") }, ...TYPES.map((x) => ({ value: x, label: tr(`req.type.${x}` as MessageKey) }))]}
            />
            <SelectField
              id="req-f-status"
              label={tr("req.filter.status")}
              value={filters.status}
              onChange={(e) => filter({ status: e.target.value as RequestStatus | "" })}
              options={[{ value: "", label: tr("req.filter.all") }, ...HISTORY.map((x) => ({ value: x, label: tr(`req.status.${x}` as MessageKey) }))]}
            />
            <SelectField
              id="req-f-year"
              label={tr("req.filter.year")}
              value={filters.year ? String(filters.year) : ""}
              onChange={(e) => filter({ year: e.target.value ? Number(e.target.value) : null })}
              options={[{ value: "", label: tr("req.filter.all") }, ...list.years.map((y) => ({ value: String(y), label: num(locale, y) }))]}
            />
          </div>
          {list.history.length ? cards(list.history, tr("req.section.history")) : <p className="muted m-0">{tr("req.empty.history")}</p>}
          {list.historyMore ? (
            <Button variant="outline" className="self-start" onClick={older}>
              {tr("req.showOlder")}
            </Button>
          ) : null}
        </Panel>
      ) : null}
      {list.scope === "own" && tab === "mine" ? (
        <Panel label={tr("req.section.mine")}>
          {list.mine.length ? (
            cards(list.mine, tr("req.section.mine"))
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p className="m-0">{tr("req.empty.mine")}</p>
              {canAsk ? (
                <Button onClick={startNew}>
                  <PlusIcon data-icon="inline-start" />
                  {tr("req.new")}
                </Button>
              ) : null}
            </div>
          )}
        </Panel>
      ) : null}
      {list.scope === "own" && tab === "paid" ? (
        <Panel label={tr("req.section.paid")}>
          {list.paidOut.length ? cards(list.paidOut, tr("req.section.paid")) : <p className="muted m-0">{tr("req.empty.paid")}</p>}
          {list.paidOutMore ? (
            <Button variant="outline" className="self-start" onClick={older}>
              {tr("req.showOlder")}
            </Button>
          ) : null}
        </Panel>
      ) : null}

      {open?.kind === "new" || open?.kind === "record" ? (
        <RequestFormDialog locale={locale} mode={open.kind} owners={data.owners} ownOwnerId={data.ownOwnerId} onClose={() => setOpen(null)} onDone={done} />
      ) : null}
      {open?.kind === "edit" ? <RequestFormDialog locale={locale} mode="edit" request={open.request} owners={data.owners} ownOwnerId={data.ownOwnerId} onClose={() => setOpen(null)} onDone={done} /> : null}
      {open?.kind === "approve" ? (
        <ApproveDialog
          locale={locale}
          request={open.request}
          canDisburse={perms.disburse && data.openMonth !== null}
          onClose={() => setOpen(null)}
          onDone={(next) => {
            router.refresh();
            setOpen(next ? { kind: "disburse", request: next } : null);
          }}
        />
      ) : null}
      {open?.kind === "reject" || open?.kind === "withdraw" || open?.kind === "cancel" ? (
        <ReasonDialog locale={locale} kind={open.kind} request={open.request} onClose={() => setOpen(null)} onDone={done} />
      ) : null}
      {open?.kind === "disburse" ? <DisburseDialog locale={locale} request={open.request} funds={data.funds} openMonth={data.openMonth} onClose={() => setOpen(null)} onDone={done} /> : null}
      {data.detail ? <RequestDetailSheet locale={locale} detail={data.detail} onClose={() => go({ request: null })} /> : null}
    </div>
  );
}
