import { ArrowRightIcon, MapPinIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { formatDay } from "@/components/distribution/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { translator, type Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/paths";
import { NoticeBody } from "./NoticeBody";
import type { NoticeDto } from "./types";

/** Up to 3 pinned notices, newest first (F9, G6). */
export function PinnedNotices({ locale, notices, more }: { locale: Locale; notices: NoticeDto[]; more: boolean }) {
  const tr = translator(locale);
  return (
    <section aria-labelledby="notices-title">
      <div className="section-head">
        <h2 id="notices-title" className="flex items-center gap-2">
          <MapPinIcon className="size-5" aria-hidden />
          {tr("home.notices.title")}
        </h2>
        {more ? (
          <Button asChild variant="ghost" className="pr-0">
            <Link href={localePath(locale, "/notices")}>
              {tr("home.notices.all")}
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        ) : null}
      </div>
      {notices.length ? (
        <ul className="m-0 flex list-none flex-col p-0">
          {notices.map((n) => (
            <li key={n.id} className="flex flex-col gap-1 border-b border-[var(--color-divider)] py-3">
              <p className="m-0 flex items-center gap-2">
                {n.unread ? <span className="unread-dot" role="img" aria-label={tr("home.notices.unread")} /> : null}
                {n.urgent ? <Badge className="bg-signal text-foreground">{tr("home.notices.urgent")}</Badge> : null}
                <span className="muted">{formatDay(locale, n.date)}</span>
              </p>
              <p className="m-0 font-bold">{n.title}</p>
              <NoticeBody locale={locale} text={n.body} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted m-0">{tr("home.notices.empty")}</p>
      )}
    </section>
  );
}
