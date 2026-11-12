import { ChatBubbleLeftEllipsisIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LinkType } from "@/lib/complaints/link-types";
import { translator, type Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/paths";
import { monthLabel } from "@/lib/periods/month";

/** C8 / G10: shown on a linked item while a complaint about it is Open or In review; opens the complaint. */
export function QuestionedBadge({ locale, complaintId }: { locale: Locale; complaintId: string | null | undefined }) {
  if (!complaintId) return null;
  return (
    <Badge asChild variant="accent" className="no-underline">
      <Link href={localePath(locale, `/notices?complaint=${complaintId}`)}>
        <ChatBubbleLeftEllipsisIcon aria-hidden />
        {translator(locale)("nc.questioned")}
      </Link>
    </Badge>
  );
}

/** C2 / flow E: the complaint form pre-filled for this item ("Question about {item} · {month}", Everyone). */
export function RaiseObjectionButton({ locale, type, id, className }: { locale: Locale; type: LinkType; id: string; className?: string }) {
  const q = new URLSearchParams({ raise: "1", link: `${type}:${id}` });
  return (
    <Button asChild variant="ghost" className={className ?? "self-start pl-0"}>
      <Link href={localePath(locale, `/notices?${q.toString()}`)}>
        <ExclamationTriangleIcon data-icon="inline-start" />
        {translator(locale)("nc.raiseObjection")}
      </Link>
    </Button>
  );
}

/** C8: "{n} open complaint(s) about {Month}." on Distribution and the Monthly report. */
export function MonthComplaintsNote({ locale, month, count }: { locale: Locale; month: string; count: number }) {
  if (!count) return null;
  const tr = translator(locale);
  const n = new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-GB").format(count);
  return (
    <p className="m-0 border-t-2 border-[var(--signal)] bg-[var(--color-surface)] p-3 text-sm font-semibold">
      <Link href={localePath(locale, `/notices?month=${month}`)} className="text-foreground underline underline-offset-2">
        {tr("nc.monthNote", { n, month: monthLabel(locale, month) })}
      </Link>
    </p>
  );
}

/** Page data for one item's detail sheet: its live complaint and whether the viewer may raise one. */
export type ItemComplaints = { questionedId?: string | null; complain: boolean };

/** Questioned badge + Raise an objection, side by side, for a detail sheet. */
export function ItemComplaintActions({ locale, type, id, complaints }: { locale: Locale; type: LinkType; id: string; complaints?: ItemComplaints }) {
  if (!complaints || (!complaints.questionedId && !complaints.complain)) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <QuestionedBadge locale={locale} complaintId={complaints.questionedId} />
      {complaints.complain ? <RaiseObjectionButton locale={locale} type={type} id={id} /> : null}
    </div>
  );
}
