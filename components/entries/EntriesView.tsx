"use client";

import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, EllipsisHorizontalIcon, LockClosedIcon, PaperClipIcon, PlusIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useQuestioned } from "@/components/complaints/use-questioned";
import { apiGet, qk, useServerSeed } from "@/lib/api/query";
import { translator, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import { DetailDrawer } from "./DetailDrawer";
import { EntryDrawer } from "./EntryDrawer";
import { categoryName, entriesHref, num, shortDate } from "./format";
import { GenerateRentDialog } from "./GenerateRentDialog";
import type { EntriesData, Kind, TxnDto } from "./types";

type TxnPage = { items: TxnDto[]; nextCursor: string | null };

type Drawer = { mode: "create"; kind: Kind; key: number } | { mode: "correct"; entry: TxnDto; key: number } | null;

/** `?new=INCOME|EXPENSE` / `?entry=<id>` deep links (Home PRD §4 + New entry, F8). */
export type EntriesAutoOpen = { create?: Kind | null; entry?: string | null };

/** S3 — Income & expenses list (Income & Expenses PRD §6.1). Filters live in the URL. */
export function EntriesView({ locale, data, autoOpen }: { locale: Locale; data: EntriesData; autoOpen?: EntriesAutoOpen }) {
  const tr = translator(locale);
  const router = useRouter();
  const create = autoOpen?.create && data.perms.create && data.status === "OPEN" ? autoOpen.create : null;
  const entry = autoOpen?.entry ?? null;
  const [drawer, setDrawer] = useState<Drawer>(() => (create ? { mode: "create", kind: create, key: 0 } : null));
  const [detailId, setDetailId] = useState<string | null>(entry);
  // Closing what a deep link opened drops its parameter, so Back/refresh don't reopen it.
  const [deepLinked, setDeepLinked] = useState(Boolean(create || entry));
  // A deep link can also arrive while this view is mounted (+ New entry on Entries): open it then too.
  const [link, setLink] = useState({ create, entry });
  if (link.create !== create || link.entry !== entry) {
    setLink({ create, entry });
    if (create) setDrawer({ mode: "create", kind: create, key: 0 });
    if (entry) setDetailId(entry);
    if (create || entry) setDeepLinked(true);
  }
  const dropDeepLink = () => {
    if (!deepLinked) return;
    setDeepLinked(false);
    router.replace(entriesHref(locale, { period: data.month, type: data.type, category: data.category }), { scroll: false });
  };
  const [rentOpen, setRentOpen] = useState(false);

  const month = monthLabel(locale, data.month);
  const open = data.status === "OPEN";
  const canCreate = data.perms.create && open;
  // One cached list per month / kind / category. Page 1 is seeded from the
  // server render; "Show more" pages are fetched and cached on the client.
  const filter = { period: data.month, kind: data.type, category: data.category };
  const list = useInfiniteQuery({
    queryKey: qk.transactions.list(filter),
    queryFn: ({ pageParam }) => {
      const sp = new URLSearchParams({ period: filter.period, kind: filter.kind, limit: "200" });
      if (filter.category !== "ALL") sp.set("category", filter.category);
      if (pageParam) sp.set("cursor", pageParam);
      return apiGet<TxnPage>(`/transactions?${sp}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    initialData: { pages: [{ items: data.items, nextCursor: data.nextCursor }], pageParams: [null] },
  });
  // A fresh server render (navigation, router.refresh) wins over an older cached list.
  useServerSeed(qk.transactions.list(filter), data, (d) => ({ pages: [{ items: d.items, nextCursor: d.nextCursor }], pageParams: [null] }));
  const items = list.data.pages.flatMap((p) => p.items);
  const questioned = useQuestioned("ENTRY", items.map((t) => t.id), !!data.perms.complaints);

  const go = (q: { period?: string; type?: Kind; category?: string }) =>
    router.push(entriesHref(locale, { period: q.period ?? data.month, type: q.type ?? data.type, category: q.category }), { scroll: false });

  const idx = data.periods.findIndex((p) => p.month === data.month);
  const older = idx >= 0 ? data.periods[idx + 1] : undefined;
  const newer = idx > 0 ? data.periods[idx - 1] : undefined;
  const chips = data.chips.filter((c) => c.kind === data.type);
  const activeChip = chips.find((c) => c.code === data.category);
  const kindLabel = tr(data.type === "INCOME" ? "entries.tab.income" : "entries.tab.expense");
  const footerLabel = activeChip ? categoryName(locale, activeChip) : kindLabel;

  // Writes invalidate the cached lists themselves (useApiMutation); the server
  // still owns totals, fund balances and month status, so re-render it too.
  const refresh = () => router.refresh();
  const startCreate = (kind: Kind) => setDrawer({ mode: "create", kind, key: Date.now() });

  const tab = (kind: Kind) => {
    const count = kind === "INCOME" ? data.totals.incomeCount : data.totals.expenseCount;
    const total = kind === "INCOME" ? data.totals.incomePaisa : data.totals.expensePaisa;
    return (
      <button type="button" className="entry-tab" aria-pressed={data.type === kind} onClick={() => data.type !== kind && go({ type: kind })}>
        <span className="entry-tab-title">{tr(kind === "INCOME" ? "entries.tab.income" : "entries.tab.expense")}</span>
        <span className="entry-tab-meta">{tr(count === 1 ? "entries.tab.meta1" : "entries.tab.meta", { count, total: formatMoney(locale, total) })}</span>
      </button>
    );
  };

  return (
    <div className="page-stack" lang={locale}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">{month}</p>
          <h1 className="page-title">{tr("entries.title")}</h1>
        </div>
        {canCreate ? (
          <div className="entries-actions flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setRentOpen(true)}>
              {tr("entries.generateRent")}
            </Button>
            <Button variant="outline" aria-label={tr("entries.addIncomeLabel")} onClick={() => startCreate("INCOME")}>
              <PlusIcon data-icon="inline-start" />
              {tr("entries.addIncome")}
            </Button>
            <Button aria-label={tr("entries.addExpenseLabel")} onClick={() => startCreate("EXPENSE")}>
              <PlusIcon data-icon="inline-start" />
              {tr("entries.addExpense")}
            </Button>
          </div>
        ) : null}
      </div>

      <nav className="month-picker self-start" aria-label={tr("entries.month")}>
        {older ? (
          <Link href={entriesHref(locale, { period: older.month, type: data.type })} aria-label={tr("entries.month.prev")}>
            <ChevronLeftIcon className="size-5" />
          </Link>
        ) : (
          <span aria-disabled="true">
            <ChevronLeftIcon className="size-5" />
          </span>
        )}
        <span className="month-picker-label">
          {data.status === "CLOSED" ? <LockClosedIcon className="size-4" aria-label={tr("entries.month.closed")} /> : null}
          {month}
          {open ? <Badge variant="accent">{tr("entries.month.draft")}</Badge> : null}
        </span>
        {newer ? (
          <Link href={entriesHref(locale, { period: newer.month, type: data.type })} aria-label={tr("entries.month.next")}>
            <ChevronRightIcon className="size-5" />
          </Link>
        ) : (
          <span aria-disabled="true">
            <ChevronRightIcon className="size-5" />
          </span>
        )}
      </nav>

      {data.status === "CLOSED" ? (
        <div className="lock-banner" role="note">
          <LockClosedIcon className="size-5 shrink-0" aria-hidden />
          <p className="m-0">
            {tr("entries.locked", { month })}
            {data.perms.superAdmin ? ` ${tr("entries.lockedReopen")}` : ""}
          </p>
        </div>
      ) : null}

      <section className="flex flex-col gap-4">
        <div className="entry-tabs">
          {tab("INCOME")}
          {tab("EXPENSE")}
        </div>

        {chips.length ? (
          <div className="chips" role="group" aria-label={tr("entries.filter")}>
            <button type="button" className="chip" aria-pressed={!activeChip} onClick={() => go({ category: "ALL" })}>
              {tr("entries.chip.all")}
            </button>
            {chips.map((c) => (
              <button key={c.id} type="button" className="chip" aria-pressed={activeChip?.id === c.id} onClick={() => go({ category: c.code })}>
                {categoryName(locale, c)}
              </button>
            ))}
          </div>
        ) : null}

        {items.length === 0 ? (
          <div className="flex flex-col items-start gap-3 border-t-2 border-foreground pt-4">
            <p className="m-0">{tr(data.type === "INCOME" ? "entries.empty.income" : "entries.empty.expense", { month })}</p>
            {data.type === "INCOME" && canCreate ? (
              <Button variant="outline" onClick={() => setRentOpen(true)}>
                {tr("entries.empty.generate")}
              </Button>
            ) : null}
          </div>
        ) : (
          <div>
            <ul className="entry-list" aria-label={tr("entries.list")}>
              {items.map((t) => (
                <li key={t.id}>
                  <EntryRow locale={locale} entry={t} questioned={!!questioned[t.id]} onOpen={() => setDetailId(t.id)} />
                </li>
              ))}
            </ul>
            {list.hasNextPage ? (
              <Button variant="outline" className="mt-3" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
                {tr("entries.more.load")}
              </Button>
            ) : null}
            <div className="entry-total">
              <span>{tr("entries.total", { label: footerLabel })}</span>
              <span className="entry-amount">{formatMoney(locale, data.totalPaisa)}</span>
            </div>
          </div>
        )}
      </section>

      {canCreate ? (
        <div className="entries-fab">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="size-14 bg-background" aria-label={tr("entries.more")}>
                <EllipsisHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52 rounded-none border-2 border-foreground">
              <DropdownMenuItem onSelect={() => startCreate("INCOME")}>{tr("entries.addIncomeLabel")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setRentOpen(true)}>{tr("entries.generateRent")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="icon" className="size-14 bg-signal text-foreground hover:bg-signal" aria-label={tr("entries.addExpenseLabel")} onClick={() => startCreate("EXPENSE")}>
            <PlusIcon className="size-7" />
          </Button>
        </div>
      ) : null}

      {drawer ? (
        <EntryDrawer
          key={drawer.key}
          locale={locale}
          data={data}
          mode={drawer.mode === "create" ? { kind: drawer.kind } : { entry: drawer.entry }}
          onClose={() => {
            setDrawer(null);
            dropDeepLink();
          }}
          onSaved={() => {
            setDrawer(null);
            dropDeepLink();
            refresh();
          }}
        />
      ) : null}

      <DetailDrawer
        key={detailId ?? "closed"}
        locale={locale}
        id={detailId}
        perms={data.perms}
        questionedId={detailId ? questioned[detailId] : undefined}
        onClose={() => {
          setDetailId(null);
          dropDeepLink();
        }}
        onChanged={refresh}
        onCorrect={(entry) => {
          setDetailId(null);
          setDrawer({ mode: "correct", entry, key: Date.now() });
        }}
      />

      {rentOpen ? <GenerateRentDialog locale={locale} data={data} onClose={() => setRentOpen(false)} onSaved={refresh} /> : null}
    </div>
  );
}

function EntryRow({ locale, entry: t, questioned = false, onOpen }: { locale: Locale; entry: TxnDto; questioned?: boolean; onOpen: () => void }) {
  const tr = translator(locale);
  const meta = [t.vendor, t.fundAccountName].filter(Boolean).join(" · ");
  return (
    <button type="button" className="entry-row" data-void={t.voidedAt ? "true" : undefined} onClick={onOpen}>
      <span className="entry-date">{shortDate(locale, t.txnDate)}</span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-1.5 font-semibold">
          {categoryName(locale, t.category)}
          {t.voidedAt ? <Badge variant="neutral">{tr("entries.tag.void")}</Badge> : null}
          {t.isCorrected ? <Badge variant="outline">{tr("entries.tag.corrected")}</Badge> : null}
          {t.fromReserve ? <Badge variant="accent">{tr("entries.tag.reserve")}</Badge> : null}
          {questioned ? <Badge variant="accent">{tr("nc.questioned")}</Badge> : null}
          {t.attachmentCount ? (
            <span className="inline-flex items-center gap-0.5 text-xs" aria-label={tr("entries.tag.files", { count: t.attachmentCount })}>
              <PaperClipIcon className="size-3.5" aria-hidden />
              {num(locale, t.attachmentCount)}
            </span>
          ) : null}
        </span>
        {t.description ? <span className="entry-desc truncate text-sm">{t.description}</span> : null}
        {meta ? <span className="muted truncate">{meta}</span> : null}
      </span>
      <span className="entry-amount">{formatMoney(locale, t.amountPaisa)}</span>
    </button>
  );
}
