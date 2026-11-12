"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { CheckIcon, EllipsisHorizontalIcon } from "@heroicons/react/24/outline";
import { formatDay } from "@/components/distribution/format";
import { AttachmentGallery } from "@/components/attachments/AttachmentGallery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { translator, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { NoticeText } from "./NoticeText";
import type { NoticeDto } from "./types";

export type NoticeAction = "edit" | "pin" | "reads" | "archive";

const num = (locale: Locale, n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-GB").format(n);

/** N1 / N4: tags, read line, formatted body with Read more, files, Mark as read, Super Admin menu. */
export function NoticeCard({
  locale,
  notice: n,
  manage,
  focused = false,
  onRead,
  onAction,
}: {
  locale: Locale;
  notice: NoticeDto;
  manage: boolean;
  focused?: boolean;
  onRead: (id: string) => void;
  onAction: (action: NoticeAction, notice: NoticeDto) => void;
}) {
  const tr = translator(locale);
  const body = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(focused);
  // Until laid out, guess from length; then measure the clamp for real.
  const [overflows, setOverflows] = useState(n.body.length > 240 || n.body.split("\n").length > 4);
  useLayoutEffect(() => {
    const el = body.current?.firstElementChild as HTMLElement | null;
    if (el && el.clientHeight > 0) setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [n.body]);
  const archived = n.archivedAt !== null;
  const readMore = () => {
    setOpen((o) => !o);
    if (!open && !n.read) onRead(n.id);
  };
  return (
    <article id={`notice-${n.id}`} aria-labelledby={`notice-title-${n.id}`} className={cn("flex flex-col gap-2 border-b border-[var(--color-divider)] py-4", focused && "bg-[var(--signal-100)] px-3")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {n.priority === "URGENT" ? <Badge className="rounded-none bg-[var(--signal)] text-foreground">{tr("nc.tag.urgent")}</Badge> : null}
          {n.pinned ? <Badge variant="neutral">{tr("nc.tag.pinned")}</Badge> : null}
          {!n.read && !archived ? <Badge variant="outline" className="border-foreground">{tr("nc.tag.new")}</Badge> : null}
          {n.editedAt ? <span className="muted text-xs">{tr("nc.notices.edited", { date: formatDay(locale, n.editedAt) })}</span> : null}
        </div>
        {manage && !archived ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={tr("nc.notices.menu", { title: n.title })}>
                <EllipsisHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44 rounded-none border-2 border-foreground">
              <DropdownMenuItem onSelect={() => onAction("edit", n)}>{tr("nc.notices.edit")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAction("pin", n)}>{tr(n.pinned ? "nc.notices.unpin" : "nc.notices.pin")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAction("reads", n)}>{tr("nc.notices.whoRead")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAction("archive", n)}>{tr("nc.notices.archive")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <p className="muted m-0 text-xs">{tr("nc.notices.readLine", { date: formatDay(locale, n.publishedAt), n: num(locale, n.readCount), m: num(locale, n.memberCount) })}</p>
      <h3 id={`notice-title-${n.id}`} className="m-0 text-base font-extrabold">
        {n.title}
      </h3>
      <div ref={body}>
        <NoticeText id={`notice-body-${n.id}`} text={n.body} clamp={open ? undefined : 4} />
      </div>
      {overflows || open ? (
        <Button variant="ghost" className="self-start pl-0" aria-expanded={open} aria-controls={`notice-body-${n.id}`} onClick={readMore}>
          {tr(open ? "nc.notices.readLess" : "nc.notices.readMore")}
        </Button>
      ) : null}
      {n.attachments.length ? <AttachmentGallery locale={locale} variant="thumbnails" items={n.attachments} /> : null}
      {!n.read && !archived ? (
        <Button variant="ghost" className="self-start pl-0" onClick={() => onRead(n.id)}>
          <CheckIcon data-icon="inline-start" />
          {tr("nc.notices.markRead")}
        </Button>
      ) : null}
    </article>
  );
}
