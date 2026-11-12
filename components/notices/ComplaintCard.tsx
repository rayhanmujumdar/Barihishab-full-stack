"use client";

import { ChatBubbleLeftIcon, CheckIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { formatDay } from "@/components/distribution/format";
import { Badge } from "@/components/ui/badge";
import { translator, type Locale } from "@/lib/i18n";
import type { ComplaintStatus } from "@/lib/complaints/rules";
import { linkChip } from "./format";
import type { ComplaintDto } from "./types";

/** §4 tags: Open outline, In review the one yellow fill, Resolved green tick + word, the rest neutral. */
export function ComplaintStatusTag({ locale, status }: { locale: Locale; status: ComplaintStatus }) {
  const tr = translator(locale);
  const label = tr(`nc.status.${status}`);
  if (status === "OPEN") return <Badge variant="outline" className="border-foreground">{label}</Badge>;
  if (status === "IN_REVIEW") return <Badge className="rounded-none bg-[var(--signal)] text-foreground">{label}</Badge>;
  if (status === "RESOLVED")
    return (
      <Badge variant="pos">
        <CheckIcon aria-hidden />
        {label}
      </Badge>
    );
  return <Badge variant="neutral">{label}</Badge>;
}

export function AdminOnlyTag({ locale }: { locale: Locale }) {
  return (
    <Badge variant="neutral">
      <LockClosedIcon aria-hidden />
      {translator(locale)("nc.tag.adminOnly")}
    </Badge>
  );
}

const num = (locale: Locale, n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-GB").format(n);

/** C1: a button opening the detail drawer. */
export function ComplaintCard({ locale, complaint: c, onOpen }: { locale: Locale; complaint: ComplaintDto; onOpen: () => void }) {
  const tr = translator(locale);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-11 w-full flex-col items-start gap-1.5 border-b border-[var(--color-divider)] bg-transparent px-0 py-3 text-left text-foreground hover:bg-[var(--color-neutral-100)]"
    >
      <span className="flex flex-wrap items-center gap-1.5">
        <ComplaintStatusTag locale={locale} status={c.status} />
        {c.visibility === "ADMIN" ? <AdminOnlyTag locale={locale} /> : null}
        {c.reopened && c.status === "OPEN" ? <Badge variant="outline" className="border-foreground">{tr("nc.tag.reopened")}</Badge> : null}
        {c.unseen ? <span className="unread-dot" role="img" aria-label={tr("nc.c.unseen")} /> : null}
      </span>
      <span className="font-extrabold">{c.title}</span>
      <span className="muted flex w-full flex-wrap items-center justify-between gap-2 text-xs">
        <span>{tr("nc.c.byLine", { name: c.authorName, date: formatDay(locale, c.createdAt) })}</span>
        <span className="flex items-center gap-1" aria-label={tr("nc.c.comments", { n: num(locale, c.commentCount) })}>
          <ChatBubbleLeftIcon className="size-4" aria-hidden />
          {num(locale, c.commentCount)}
        </span>
      </span>
      {c.link ? <span className="bg-[var(--color-surface)] px-2 py-0.5 text-xs font-semibold">{linkChip(locale, c.link)}</span> : null}
    </button>
  );
}
