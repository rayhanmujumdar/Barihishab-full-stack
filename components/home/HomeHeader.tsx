import { ArrowRightIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { translator, type Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/paths";
import { monthLabel } from "@/lib/periods/month";
import { QuickActions } from "./QuickActions";
import type { EntryFormData, HomeMonthDto, QuickActionsDto } from "./types";

/** "{House} · {Month}", the greeting and the Super Admin's quick actions (F1, G1 — no month picker). */
export function HomeHeader({
  locale,
  houseName,
  month,
  name,
  quick,
}: {
  locale: Locale;
  houseName: string;
  month: HomeMonthDto | null;
  name: string;
  /** Super Admin only. */
  quick: { actions: QuickActionsDto; form: EntryFormData } | null;
}) {
  const tr = translator(locale);
  return (
    <header className="home-header">
      <div className="min-w-0">
        <p className="kicker">{month ? tr("home.kicker", { house: houseName, month: monthLabel(locale, month.key) }) : houseName}</p>
        <h1 className="page-title">{tr("home.hello", { name })}</h1>
      </div>
      {quick && quick.actions.monthOpen ? <QuickActions locale={locale} actions={quick.actions} form={quick.form} /> : null}
      {!quick && month && !month.open ? <p className="m-0 font-semibold">{tr("home.noOpenMonthOwner")}</p> : null}
      {quick && !quick.actions.monthOpen ? (
        <div className="flex flex-col items-start gap-1">
          <p className="m-0 font-semibold">{tr("home.noOpenMonth")}</p>
          <Button asChild variant="ghost" className="pl-0">
            <Link href={localePath(locale, "/distribution")}>
              {tr("nav.distribution")}
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      ) : null}
    </header>
  );
}
