import { ArrowRightIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { shortDate } from "@/components/entries/format";
import { signedMoney } from "@/components/owners/format";
import { Button } from "@/components/ui/button";
import { translator, type Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/paths";
import { activityHref, activitySub, activityTitle } from "./format";
import type { ActivityItem } from "./types";

/** The 6 newest money events of the house; See all → Income & Expenses (F8, G5). */
export function LatestActivity({ locale, items, month }: { locale: Locale; items: ActivityItem[]; month: string | null }) {
  const tr = translator(locale);
  return (
    <section aria-labelledby="act-title">
      <div className="section-head">
        <h2 id="act-title">{tr("home.act.title")}</h2>
        <Button asChild variant="ghost" className="pr-0">
          <Link href={localePath(locale, month ? `/entries?period=${month}` : "/entries")}>
            {tr("home.act.seeAll")}
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      </div>
      {items.length ? (
        <ul className="m-0 list-none p-0" aria-label={tr("home.act.title")}>
          {items.map((i) => (
            <li key={`${i.kind}-${i.id}`}>
              <Link href={activityHref(locale, i)} className="list-row activity-row">
                <span className="activity-date">{shortDate(locale, i.date)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{activityTitle(locale, i)}</span>
                  <span className="muted block truncate">{activitySub(locale, i)}</span>
                </span>
                <span className={`bal${i.amountPaisa > 0 ? " bal-pos" : ""}`}>{signedMoney(locale, i.amountPaisa)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted m-0">{tr("home.act.empty")}</p>
      )}
    </section>
  );
}
