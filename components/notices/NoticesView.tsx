"use client";

import { useCallback, useEffect, useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { SelectField } from "@/components/forms/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { toBanglaDigits, translator, type Locale } from "@/lib/i18n";
import { monthLabel } from "@/lib/periods/month";
import { cn } from "@/lib/utils";
import { ComplaintCard } from "./ComplaintCard";
import { ComplaintDrawer } from "./ComplaintDrawer";
import { ComplaintFormDialog } from "./ComplaintFormDialog";
import { noticesHref } from "./format";
import { NoticeCard, type NoticeAction } from "./NoticeCard";
import { NoticeDialog } from "./NoticeDialog";
import type { ComplaintFilter, NoticeDto, NoticesPageData, NoticesTab } from "./types";
import { WhoReadSheet } from "./WhoReadSheet";

const FILTERS: ComplaintFilter[] = ["all", "open", "in_review", "closed", "mine"];
const TABS: { tab: NoticesTab; label: "nc.notices.title" | "nc.c.title"; href: { tab: NoticesTab | null } }[] = [
  { tab: "notices", label: "nc.notices.title", href: { tab: null } },
  { tab: "complaints", label: "nc.c.title", href: { tab: "complaints" } },
];
type Open = { kind: "new" } | { kind: "edit" | "reads" | "archive"; notice: NoticeDto } | null;

/** S10 Notices & complaints: Notices and Complaints as two URL tabs (`?tab=`), one section at a time. */
export function NoticesView({ locale, data }: { locale: Locale; data: NoticesPageData }) {
  const tr = translator(locale);
  const router = useRouter();
  const { perms, notices, complaints } = data;
  const [open, setOpen] = useState<Open>(() => (data.newNotice && perms.manage ? { kind: "new" } : null));
  const [raising, setRaising] = useState(data.raise.open && perms.create);
  const [busy, setBusy] = useState(false);
  const tab = data.tab;
  // Complaint links always carry the tab: "All" with no month would otherwise land on Notices.
  const base = tab === "complaints" ? { tab, filter: data.filter, month: data.month } : { archived: data.archived ? 1 : null };
  const go = (q: Record<string, string | number | null>, push = false) => {
    const href = noticesHref(locale, { ...base, ...q });
    if (push) router.push(href, { scroll: false });
    else router.replace(href, { scroll: false });
  };
  const refresh = useCallback(() => router.refresh(), [router]);

  async function read(id: string) {
    const res = await apiFetch(`/notices/${id}/read`, { method: "POST" });
    if (!res.ok) return toast.error(res.status === 0 ? tr("common.network") : res.error.message);
    refresh();
  }

  // `?notice=` (email / Home link): scroll to it and record the read (G5).
  const focus = data.focusNotice;
  const focusUnread = notices.items.find((n) => n.id === focus && !n.read)?.id ?? null;
  useEffect(() => {
    if (!focus) return;
    document.getElementById(`notice-${focus}`)?.scrollIntoView({ block: "center" });
  }, [focus]);
  useEffect(() => {
    if (!focusUnread) return;
    void apiFetch(`/notices/${focusUnread}/read`, { method: "POST" }).then((r) => {
      if (r.ok) router.refresh();
      else toast.error(r.status === 0 ? translator(locale)("common.network") : r.error.message);
    });
  }, [focusUnread, router, locale]);

  async function readAll() {
    setBusy(true);
    const res = await apiFetch("/notices/read-all", { method: "POST" });
    setBusy(false);
    if (!res.ok) return toast.error(res.status === 0 ? tr("common.network") : res.error.message);
    toast(tr("nc.toast.allRead"));
    refresh();
  }

  async function onAction(action: NoticeAction, n: NoticeDto) {
    if (action !== "pin") return setOpen({ kind: action === "reads" ? "reads" : action, notice: n });
    const res = await apiFetch(`/notices/${n.id}`, { method: "PATCH", body: { pinned: !n.pinned } });
    if (!res.ok) return toast.error(res.status === 0 ? tr("common.network") : res.error.message);
    toast(tr(n.pinned ? "nc.toast.unpinned" : "nc.toast.pinned"));
    refresh();
  }

  async function archive(n: NoticeDto) {
    setBusy(true);
    const res = await apiFetch(`/notices/${n.id}/archive`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.status === 0 ? tr("common.network") : res.error.message);
      return;
    }
    toast(tr("nc.toast.archived"));
    setOpen(null);
    refresh();
  }

  const closeNoticeDialog = () => {
    setOpen(null);
    if (data.newNotice) go({ new: null });
  };
  const closeRaise = () => {
    setRaising(false);
    if (data.raise.open) go({ raise: null, link: null });
  };
  const filtered = data.filter !== "all" || data.month !== "";
  // Sheets and dialogs follow the refreshed list; the click-time copy is only a fallback (e.g. just archived).
  const current = open && open.kind !== "new" ? (notices.items.find((n) => n.id === open.notice.id) ?? open.notice) : undefined;

  return (
    <div className="page-stack" lang={locale}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {data.houseName ? <p className="kicker">{data.houseName}</p> : null}
          <h1 className="page-title">{tr("nc.title")}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {perms.create ? (
            <Button variant="outline" onClick={() => setRaising(true)}>
              {tr("nc.raise")}
            </Button>
          ) : null}
          {perms.manage ? (
            <Button onClick={() => setOpen({ kind: "new" })}>
              <PlusIcon data-icon="inline-start" />
              {tr("nc.newNotice")}
            </Button>
          ) : null}
        </div>
      </div>

      <nav className="rpt-tabs" aria-label={tr("nc.tabs")}>
        {TABS.map((t) => {
          const unread = t.tab === "notices" ? notices.unread : 0;
          const label = tr(t.label);
          return (
            <Link
              key={t.tab}
              href={noticesHref(locale, t.href)}
              scroll={false}
              aria-current={t.tab === tab ? "page" : undefined}
              aria-label={unread > 0 ? tr("nc.tabs.unread", { label, n: unread }) : undefined}
              className={cn("rpt-tab gap-2", t.tab === tab && "rpt-tab-active")}
            >
              {label}
              {unread > 0 ? <Badge className="bg-signal font-extrabold text-foreground">{locale === "bn" ? toBanglaDigits(String(unread)) : String(unread)}</Badge> : null}
            </Link>
          );
        })}
      </nav>

      {tab === "notices" ? (
        <section aria-labelledby="notices-col" className="flex min-w-0 flex-col">
          {/* The tab already names the section; only the archive view needs a visible heading. */}
          {data.archived ? (
            <div className="section-head">
              <h2 id="notices-col">{tr("nc.notices.archivedLink")}</h2>
            </div>
          ) : (
            <h2 id="notices-col" className="sr-only">
              {tr("nc.notices.title")}
            </h2>
          )}
          {!data.archived && notices.unread > 0 ? (
            <Button variant="ghost" className="self-start pl-0" disabled={busy} onClick={readAll}>
              {tr("nc.notices.markAll")}
            </Button>
          ) : null}
          {notices.items.length ? (
            <div className="flex flex-col">
              {notices.items.map((n) => (
                <NoticeCard key={n.id} locale={locale} notice={n} manage={perms.manage} focused={n.id === focus} onRead={read} onAction={onAction} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-2 py-4">
              <p className="m-0">{tr(data.archived ? "nc.notices.archivedEmpty" : "nc.notices.empty")}</p>
              {perms.manage && !data.archived ? (
                <Button onClick={() => setOpen({ kind: "new" })}>
                  <PlusIcon data-icon="inline-start" />
                  {tr("nc.newNotice")}
                </Button>
              ) : null}
            </div>
          )}
          {notices.more ? (
            <Button variant="ghost" className="self-start pl-0" onClick={() => go({ nlimit: notices.items.length + 50 })}>
              {tr("nc.notices.showOlder")}
            </Button>
          ) : null}
          <Link href={noticesHref(locale, { ...base, archived: data.archived ? null : 1 })} className="mt-3 inline-flex min-h-11 items-center font-semibold text-foreground underline underline-offset-2">
            {tr(data.archived ? "nc.notices.back" : "nc.notices.archivedLink")}
          </Link>
        </section>
      ) : (
        <section aria-labelledby="complaints-col" className="flex min-w-0 flex-col gap-3">
          <h2 id="complaints-col" className="sr-only">
            {tr("nc.c.title")}
          </h2>
          <nav aria-label={tr("nc.c.filters")} className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <Link
                key={f}
                href={noticesHref(locale, { ...base, filter: f })}
                scroll={false}
                aria-current={data.filter === f ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center border border-[var(--color-divider)] px-3 text-sm font-semibold text-foreground no-underline",
                  data.filter === f ? "bg-foreground text-background" : "hover:bg-[var(--color-neutral-200)]",
                )}
              >
                {tr(`nc.c.filter.${f}`)}
              </Link>
            ))}
          </nav>
          <SelectField
            id="complaints-month"
            label={tr("nc.c.month")}
            value={data.month}
            onChange={(e) => go({ month: e.target.value || null })}
            options={[{ value: "", label: tr("nc.c.anyMonth") }, ...data.months.map((m) => ({ value: m, label: monthLabel(locale, m) }))]}
          />
          {complaints.items.length ? (
            <ul className="m-0 flex list-none flex-col p-0">
              {complaints.items.map((c) => (
                <li key={c.id}>
                  <ComplaintCard locale={locale} complaint={c} onOpen={() => go({ complaint: c.id }, true)} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 py-2">{tr(filtered ? "nc.c.emptyFilter" : "nc.c.empty")}</p>
          )}
          {complaints.more ? (
            <Button variant="ghost" className="self-start pl-0" onClick={() => go({ climit: complaints.items.length + 50 })}>
              {tr("nc.c.showOlder")}
            </Button>
          ) : null}
        </section>
      )}

      {open?.kind === "new" || open?.kind === "edit" ? (
        <NoticeDialog
          locale={locale}
          notice={open.kind === "edit" ? current : undefined}
          reach={{ normal: notices.reachEmail ?? notices.activeMembers, all: notices.activeMembers }}
          onClose={closeNoticeDialog}
          onDone={() => {
            closeNoticeDialog();
            refresh();
          }}
        />
      ) : null}
      {open?.kind === "reads" ? <WhoReadSheet locale={locale} notice={current!} onClose={() => setOpen(null)} onReminded={refresh} /> : null}
      {open?.kind === "archive" ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setOpen(null)}
          title={tr("nc.archive.title")}
          description={tr("nc.archive.body")}
          confirmLabel={tr("nc.notices.archive")}
          cancelLabel={tr("common.cancel")}
          busy={busy}
          onConfirm={() => archive(current!)}
        />
      ) : null}
      {raising ? (
        <ComplaintFormDialog
          locale={locale}
          link={data.raise.link}
          onClose={closeRaise}
          onDone={(id) => {
            setRaising(false);
            go({ tab: "complaints", archived: null, raise: null, link: null, complaint: id });
          }}
        />
      ) : null}
      {data.detail ? <ComplaintDrawer key={data.detail.id} locale={locale} complaint={data.detail} onClose={() => go({ complaint: null })} onChanged={refresh} /> : null}
    </div>
  );
}
