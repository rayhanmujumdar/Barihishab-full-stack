import { ArrowRightIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { distributionHref, formatDay } from "@/components/distribution/format";
import { num } from "@/components/owners/format";
import { requestsHref } from "@/components/requests/format";
import { Button } from "@/components/ui/button";
import { translator, type Locale, type MessageKey } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import { unitList } from "./format";
import { RentButton } from "./QuickActions";
import { ReminderStrip } from "./ReminderStrip";
import type { EntryFormData, Reminder } from "./types";

function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button asChild>
      <Link href={href}>
        {children}
        <ArrowRightIcon data-icon="inline-end" />
      </Link>
    </Button>
  );
}

/** Close-the-month · Rent status · Approved-not-paid strips, most urgent first, at most two (F6). */
export function Reminders({ locale, reminders, rentForm }: { locale: Locale; reminders: Reminder[]; rentForm: EntryFormData | null }) {
  const tr = translator(locale);
  if (!reminders.length) return null;
  return (
    <section aria-label={tr("home.block.reminders")} className="flex flex-col gap-3">
      {reminders.map((r) => {
        if (r.kind === "CLOSE_MONTH")
          return (
            <ReminderStrip key={r.key} locale={locale} hideKey={r.key} action={<LinkButton href={distributionHref(locale, r.month)}>{tr("home.reminder.review")}</LinkButton>}>
              <strong>{tr("home.rem.close", { month: monthLabel(locale, r.month) })}</strong>
              {r.units.length ? <> {tr(r.units.length === 1 ? "home.reminder.unpaid" : "home.reminder.unpaidMany", { units: unitList(r.units) })}</> : null}
            </ReminderStrip>
          );
        if (r.kind === "RENT_STATUS")
          return (
            <ReminderStrip key={r.key} locale={locale} hideKey={r.key} action={rentForm ? <RentButton locale={locale} form={rentForm} /> : null}>
              {tr(r.units.length === 1 ? "home.rem.rent1" : "home.rem.rentMany", { count: num(locale, r.units.length), units: unitList(r.units) })}
            </ReminderStrip>
          );
        const q = r.request;
        return (
          <ReminderStrip key={r.key} locale={locale} hideKey={r.key} action={<LinkButton href={requestsHref(locale, { tab: "approved", request: q.id })}>{tr("home.rem.disburse")}</LinkButton>}>
            {tr("home.rem.overdue", { owner: q.ownerName, amount: formatMoney(locale, q.amountPaisa), type: tr(`home.req.type.${q.type}` as MessageKey), date: formatDay(locale, q.neededBy) })}
          </ReminderStrip>
        );
      })}
    </section>
  );
}
