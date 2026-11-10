"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { RequestTag } from "@/components/requests/RequestTag";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AttachmentGallery } from "@/components/attachments/AttachmentGallery";
import { shortDate } from "@/components/entries/format";
import { formatDateTime, translator, type Locale, type MessageKey } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import { cn } from "@/lib/utils";
import { balanceText, balanceTone, signedMoney, typeLabel } from "./format";
import type { LedgerEntryDto, StatementDto } from "./types";

type Row = StatementDto["rows"][number];

/** Owner statement table (F3): Brought forward → rows with running balance → Closing. */
export function StatementTable({
  locale,
  statement,
  onVoid,
}: {
  locale: Locale;
  statement: StatementDto;
  /** Present when the viewer may void and a month is open. */
  onVoid?: (entry: LedgerEntryDto) => void;
}) {
  const tr = translator(locale);
  const [selected, setSelected] = useState<Row | null>(null);
  const closing = balanceText(locale, statement.closingPaisa > 0 ? "OWED" : statement.closingPaisa < 0 ? "ADVANCE" : "SETTLED", statement.closingPaisa);
  const toLabel = statement.to === "latest" ? tr("st.latest") : monthLabel(locale, statement.to);

  return (
    <>
      <div className="st-wrap" role="region" aria-label={tr("st.table")} tabIndex={0}>
        <table className="st-table">
          <thead>
            <tr>
              <th className="st-sticky st-sticky-1">{tr("st.col.date")}</th>
              <th className="st-sticky st-sticky-2">{tr("st.col.type")}</th>
              <th className="num">{tr("st.col.amount")}</th>
              <th className="num">{tr("st.col.running")}</th>
              <th>{tr("st.col.month")}</th>
              <th>{tr("st.col.note")}</th>
              {onVoid ? <th>{tr("st.col.action")}</th> : null}
            </tr>
          </thead>
          <tbody>
            <tr className="st-edge">
              <td className="st-sticky st-sticky-1" />
              <td className="st-sticky st-sticky-2">{tr("st.bf")}</td>
              <td />
              <td className={cn("num", `bal-${balanceTone(statement.broughtForwardPaisa)}`)}>{formatMoney(locale, statement.broughtForwardPaisa)}</td>
              <td colSpan={onVoid ? 3 : 2} />
            </tr>
            {statement.rows.length === 0 ? (
              <tr>
                <td colSpan={onVoid ? 7 : 6}>
                  {tr("st.empty", { from: monthLabel(locale, statement.from), to: toLabel })}
                </td>
              </tr>
            ) : null}
            {statement.rows.map((r) => (
              <tr key={r.id} data-void={r.voided ? "true" : undefined}>
                <td className="st-sticky st-sticky-1 whitespace-nowrap">{shortDate(locale, r.date)}</td>
                <td className="st-sticky st-sticky-2">
                  <button type="button" className="st-row-btn" aria-label={tr("st.detail.open", { type: typeLabel(locale, r.type), date: shortDate(locale, r.date) })} onClick={() => setSelected(r)}>
                    {typeLabel(locale, r.type)}
                  </button>
                  {r.voided ? (
                    <Badge variant="neutral" className="ml-1.5">
                      {tr("st.tag.void")}
                    </Badge>
                  ) : null}
                </td>
                <td className={cn("num", r.amountPaisa > 0 && !r.voided && "bal-pos")}>{signedMoney(locale, r.amountPaisa)}</td>
                <td className={cn("num", `bal-${balanceTone(r.runningPaisa)}`)}>{formatMoney(locale, r.runningPaisa)}</td>
                <td className="whitespace-nowrap">{monthLabel(locale, r.month)}</td>
                <td>
                  <span className="st-note">{[r.note, r.referenceNo].filter(Boolean).join(" · ")}</span>
                  {r.referenceMonth ? <span className="muted"> {tr("st.for", { month: monthLabel(locale, r.referenceMonth) })}</span> : null}
                  {r.isSelf ? (
                    <Badge variant="accent" className="ml-1.5">
                      {tr("st.tag.self")}
                    </Badge>
                  ) : null}
                  {r.flagged ? (
                    <Badge variant="destructive" className="ml-1.5">
                      {tr("st.tag.flagged")}
                    </Badge>
                  ) : null}
                </td>
                {onVoid ? (
                  <td>
                    {(r.type === "PAYOUT" || r.type === "ADVANCE") && !r.voided ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        aria-label={tr("st.voidRow", { type: typeLabel(locale, r.type), amount: formatMoney(locale, Math.abs(r.amountPaisa)) })}
                        onClick={() => onVoid(r)}
                      >
                        {tr("st.void")}
                      </Button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
            <tr className="st-edge">
              <td className="st-sticky st-sticky-1" />
              <td className="st-sticky st-sticky-2">{tr("st.closing")}</td>
              <td />
              <td className={cn("num", `bal-${balanceTone(statement.closingPaisa)}`)}>
                {formatMoney(locale, statement.closingPaisa)} <span className="text-xs">({closing.word})</span>
              </td>
              <td colSpan={onVoid ? 3 : 2} />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="muted m-0">{tr("st.legend")}</p>
      <RowDetail
        locale={locale}
        row={selected}
        onClose={() => setSelected(null)}
        onOriginal={(id) => setSelected(statement.rows.find((r) => r.id === id) ?? null)}
      />
    </>
  );
}

function RowDetail({ locale, row, onClose, onOriginal }: { locale: Locale; row: Row | null; onClose: () => void; onOriginal: (id: string) => void }) {
  const tr = translator(locale);
  const items: [MessageKey, React.ReactNode][] = row
    ? (
        [
          ["st.detail.by", row.recordedBy],
          ["st.detail.at", formatDateTime(locale, row.recordedAt)],
          ["st.detail.fund", row.fundAccountName],
          ["st.detail.method", row.method ? tr(`method.${row.method}` as MessageKey) : null],
          ["st.detail.ref", row.referenceNo],
          ["st.detail.reason", row.voidReason],
          [
            "st.detail.files",
            row.attachments.length ? <AttachmentGallery locale={locale} items={row.attachments} variant="links" /> : null,
          ],
        ] as [MessageKey, React.ReactNode][]
      ).filter(([, v]) => v)
    : [];
  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 border-l-2 border-foreground bg-background p-0 sm:max-w-[480px]" aria-describedby={undefined}>
        <SheetHeader className="border-b-2 border-foreground px-5 py-4">
          <SheetTitle className="text-[22px] font-extrabold tracking-[-0.015em]">{tr("st.detail.title")}</SheetTitle>
        </SheetHeader>
        {row ? (
          <div className="flex flex-col gap-4 p-5" lang={locale}>
            <p className="m-0 text-lg font-extrabold">
              {typeLabel(locale, row.type)} · {signedMoney(locale, row.amountPaisa)}
              {row.voided ? (
                <Badge variant="neutral" className="ml-2">
                  {tr("st.tag.void")}
                </Badge>
              ) : null}
            </p>
            {row.note ? <p className="m-0">{row.note}</p> : null}
            {row.request ? <RequestTag locale={locale} request={row.request} /> : null}
            <dl className="kv">
              {items.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt>{tr(k)}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {row.reversesId ? (
              <Button variant="outline" className="self-start" onClick={() => onOriginal(row.reversesId!)}>
                {tr("st.detail.showOriginal")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
