"use client";

import { XMarkIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ErrorStrip } from "@/components/forms/error-strip";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiFetch } from "@/lib/api/client";
import { apiGet, queryErrorMessage, useApiMutation } from "@/lib/api/query";
import { formatDateTime, translator, type Locale } from "@/lib/i18n";
import type { NoticeDto } from "./types";

type Reads = { read: { userId: string; name: string; readAt: string }[]; notRead: { userId: string; name: string }[] };

/** G6: who has read (with time) / not yet, and Remind unread for urgent notices. */
export function WhoReadSheet({ locale, notice, onClose, onReminded }: { locale: Locale; notice: NoticeDto; onClose: () => void; onReminded: () => void }) {
  const tr = translator(locale);
  const q = useQuery({ queryKey: ["notices", "reads", notice.id], queryFn: () => apiGet<Reads>(`/notices/${notice.id}/reads`) });
  const remind = useApiMutation(["notices", "remind", notice.id], () => apiFetch<{ reminded: number }>(`/notices/${notice.id}/remind`, { method: "POST" }));
  // Set on success so the button locks before the refreshed notice (remindedToday) arrives.
  const [sent, setSent] = useState(false);
  const remindedToday = notice.remindedToday || sent;
  const canRemind = notice.priority === "URGENT" && !notice.archivedAt && !remindedToday;
  async function onRemind() {
    const res = await remind.run();
    if (!res.ok) return toast.error(res.status === 0 ? tr("common.network") : res.error.message);
    setSent(true);
    toast(tr("nc.toast.reminded", { n: new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-GB").format(res.data.reminded) }));
    onReminded();
  }
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} aria-describedby={undefined} className="w-full gap-0 overflow-y-auto border-l-2 border-foreground bg-background p-0 data-[side=right]:w-full sm:max-w-[480px] data-[side=right]:sm:max-w-[480px]">
        <SheetHeader className="flex-row items-center justify-between gap-3 border-b-2 border-foreground px-5 py-4">
          <SheetTitle className="text-[22px] font-extrabold tracking-[-0.015em]">{tr("nc.reads.title")}</SheetTitle>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label={tr("common.close")}>
              <XMarkIcon />
            </Button>
          </SheetClose>
        </SheetHeader>
        <div className="flex flex-col gap-5 p-5" lang={locale}>
          <p className="m-0 font-bold">{notice.title}</p>
          <ErrorStrip message={q.isError ? queryErrorMessage(q.error, tr("common.network")) : null} />
          {q.data ? (
            <>
              <section aria-labelledby="reads-read" className="flex flex-col gap-1">
                <h3 id="reads-read" className="section-head m-0 text-base font-extrabold">
                  {tr("nc.reads.read")}
                </h3>
                {q.data.read.length ? (
                  <ul className="m-0 list-none p-0">
                    {q.data.read.map((r) => (
                      <li key={r.userId} className="flex min-h-11 items-center justify-between gap-2 border-b border-[var(--color-divider)]">
                        <span className="font-semibold">{r.name}</span>
                        <span className="muted text-xs">{formatDateTime(locale, r.readAt)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted m-0">{tr("nc.reads.none")}</p>
                )}
              </section>
              <section aria-labelledby="reads-not" className="flex flex-col gap-1">
                <h3 id="reads-not" className="section-head m-0 text-base font-extrabold">
                  {tr("nc.reads.notYet")}
                </h3>
                {q.data.notRead.length ? (
                  <ul className="m-0 list-none p-0">
                    {q.data.notRead.map((r) => (
                      <li key={r.userId} className="flex min-h-11 items-center border-b border-[var(--color-divider)] font-semibold">
                        {r.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted m-0">{tr("nc.reads.all")}</p>
                )}
              </section>
              {notice.priority === "URGENT" && q.data.notRead.length ? (
                <div className="flex flex-col gap-1">
                  <Button className="self-start" disabled={!canRemind || remind.isPending} onClick={onRemind}>
                    {tr("nc.reads.remind")}
                  </Button>
                  {remindedToday ? <p className="muted m-0 text-xs">{tr("nc.reads.remindedToday")}</p> : null}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
