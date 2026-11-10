"use client";

import { XMarkIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { AttachmentGallery } from "@/components/attachments/AttachmentGallery";
import { shortDate } from "@/components/loans/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDateTime, translator, type Locale, type MessageKey } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/paths";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import type { LinkedEntry, TimelineItem } from "@/lib/requests/dto";
import { reqNumber, typeLabel } from "./format";
import { RequestStatusTag } from "./RequestCard";
import type { RequestDetailDto } from "./types";

function entryLink(locale: Locale, e: LinkedEntry, ownerName: string): { href: string; text: string } {
  const tr = translator(locale);
  if (e.kind === "ADVANCE") return { href: localePath(locale, `/owners/${e.ownerId}`), text: tr("req.entry.ADVANCE", { name: ownerName }) };
  if (e.kind === "LOAN") return { href: localePath(locale, `/advances?loan=${e.id}`), text: tr("al.loanNo", { n: e.loanNumber ?? 0 }) };
  return { href: localePath(locale, `/entries?period=${e.month}&type=EXPENSE&category=OWNER_GRANT`), text: tr("req.entry.EXPENSE", { month: e.month ? monthLabel(locale, e.month) : "" }) };
}

function timelineText(locale: Locale, t: TimelineItem): string {
  const tr = translator(locale);
  const parts = [tr(`req.tl.${t.kind}` as MessageKey)];
  if (t.amountPaisa !== null) parts.push(formatMoney(locale, t.amountPaisa));
  if (t.date) parts.push(shortDate(locale, t.date));
  if (t.method) parts.push(tr(`method.${t.method}` as MessageKey));
  if (t.referenceNo) parts.push(t.referenceNo);
  return parts.join(" · ");
}

/** F9: every field, files, the linked entry and the timeline of who did what. */
export function RequestDetailSheet({ locale, detail, onClose }: { locale: Locale; detail: RequestDetailDto; onClose: () => void }) {
  const tr = translator(locale);
  const r = detail.request;
  const link = r.linkedEntry ? entryLink(locale, r.linkedEntry, r.ownerName) : null;
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} aria-describedby={undefined} className="w-full gap-0 overflow-y-auto border-l-2 border-foreground bg-background p-0 sm:max-w-[600px]">
        <SheetHeader className="flex-row items-center justify-between gap-3 border-b-2 border-foreground px-5 py-4">
          <SheetTitle className="text-[22px] font-extrabold tracking-[-0.015em]">{tr("req.detail.title", { number: reqNumber(locale, r.number), name: r.ownerName })}</SheetTitle>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label={tr("common.close")}>
              <XMarkIcon />
            </Button>
          </SheetClose>
        </SheetHeader>
        <div className="flex flex-col gap-5 p-5" lang={locale}>
          <div className="flex flex-wrap items-center gap-2">
            <RequestStatusTag locale={locale} status={r.status} />
            {r.isSelf && r.status !== "PENDING" ? <Badge variant="outline" className="rounded-none">{tr("req.tag.selfApproved")}</Badge> : null}
            {r.overdue ? <Badge variant="destructive" className="rounded-none">{tr("req.tag.overdue")}</Badge> : null}
          </div>
          <dl className="kv m-0">
            <dt>{tr("req.form.type")}</dt>
            <dd>{typeLabel(locale, r.type)}</dd>
            {!r.limited ? (
              <>
                <dt>{tr("req.detail.requested")}</dt>
                <dd>{formatMoney(locale, r.amountRequestedPaisa)}</dd>
              </>
            ) : null}
            {r.amountApprovedPaisa !== null ? (
              <>
                <dt>{tr("req.detail.approved")}</dt>
                <dd>{formatMoney(locale, r.amountApprovedPaisa)}</dd>
              </>
            ) : null}
            <dt>{tr("req.form.reason")}</dt>
            <dd>{r.reason}</dd>
            <dt>{tr("req.detail.asked")}</dt>
            <dd>{shortDate(locale, r.askedOn)}</dd>
            <dt>{tr("req.form.neededBy")}</dt>
            <dd>{shortDate(locale, r.neededBy)}</dd>
            {r.repaymentPlan ? (
              <>
                <dt>{tr("req.form.plan")}</dt>
                <dd>{r.repaymentPlan}</dd>
              </>
            ) : null}
            {r.recordedBy ? (
              <>
                <dt>{tr("req.detail.recorded")}</dt>
                <dd>{r.recordedBy}</dd>
              </>
            ) : null}
            {r.decisionNote ? (
              <>
                <dt>{tr("req.detail.note")}</dt>
                <dd>{r.decisionNote}</dd>
              </>
            ) : null}
            {link ? (
              <>
                <dt>{tr("req.detail.entry")}</dt>
                <dd>
                  <Link href={link.href} className="font-semibold text-foreground underline underline-offset-2">
                    {link.text}
                  </Link>
                  {r.linkedEntry?.voided ? <span className="ml-2 font-semibold">· {tr("req.tag.voided")}</span> : null}
                </dd>
              </>
            ) : null}
          </dl>
          {detail.attachments.length ? (
            <section className="flex flex-col gap-2">
              <h3 className="m-0 text-base font-extrabold">{tr("req.files.title")}</h3>
              <AttachmentGallery locale={locale} variant="thumbnails" items={detail.attachments} />
              {detail.attachments.some((a) => a.isPrivate) ? (
                <p className="muted m-0 text-xs">{tr("req.detail.privateFiles", { names: detail.attachments.filter((a) => a.isPrivate).map((a) => a.fileName).join(", ") })}</p>
              ) : null}
            </section>
          ) : null}
          <section className="flex flex-col gap-2">
            <h3 className="m-0 text-base font-extrabold">{tr("req.detail.timeline")}</h3>
            <ol className="m-0 flex list-none flex-col border-t border-[var(--color-divider)] p-0">
              {detail.timeline.map((t, i) => (
                <li key={`${t.kind}-${i}`} className="flex flex-col gap-0.5 border-b border-[var(--color-divider)] py-2">
                  <span className="font-semibold">{timelineText(locale, t)}</span>
                  {t.note ? <span className="text-sm">“{t.note}”</span> : null}
                  <span className="muted text-xs">{tr("req.tl.by", { name: t.by ?? "—", at: formatDateTime(locale, t.at) ?? "" })}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
