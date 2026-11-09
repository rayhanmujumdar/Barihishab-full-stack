"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DocumentIcon, LockClosedIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ErrorStrip } from "@/components/forms/error-strip";
import { TextField } from "@/components/forms/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiFetch } from "@/lib/api/client";
import { formatDateTime, translator, type Locale, type MessageKey } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import { AttachmentPicker } from "./AttachmentPicker";
import { categoryName, longDate } from "./format";
import type { EntriesPerms, TxnDto } from "./types";

export type Detail = TxnDto & {
  recordedBy: string | null;
  tenantName: string | null;
  attachments: { id: string; fileName: string; mime: string; sizeBytes: number }[];
  history: { action: string; at: string; actorName: string | null; before: unknown; after: unknown; reason: string | null }[];
};

type Signed = { url: string; mime: string; expiresAt: string };

/** A signed URL with at least 30 s left is reused instead of re-signing. */
const isFresh = (s: Signed | undefined): s is Signed => !!s && Date.parse(s.expiresAt) - Date.now() > 30_000;

/** Entry detail drawer (PRD §6.3) with Void dialog (§6.4) and bills. */
export function DetailDrawer({
  locale,
  id,
  perms,
  onClose,
  onChanged,
  onCorrect,
}: {
  locale: Locale;
  id: string | null;
  perms: EntriesPerms;
  onClose: () => void;
  onChanged: () => void;
  onCorrect: (entry: TxnDto) => void;
}) {
  const tr = translator(locale);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [urls, setUrls] = useState<Record<string, Signed>>({});
  const [error, setError] = useState<string | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  // The Void / Remove buttons may be gone after confirming; keep focus inside the drawer.
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async (txnId: string) => {
    const res = await apiFetch<Detail>(`/transactions/${txnId}`);
    if (!res.ok) {
      setError(res.status === 0 ? tr("common.network") : res.error.message);
      return;
    }
    setDetail(res.data);
    // Signed 5-minute URLs for thumbnails (ATT-02).
    const signed = await Promise.all(
      res.data.attachments.map(async (a) => [a.id, await apiFetch<Signed>(`/attachments/${a.id}`)] as const),
    );
    setUrls(Object.fromEntries(signed.filter(([, r]) => r.ok).map(([k, r]) => [k, (r as { data: Signed }).data])));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tr` is derived from locale only
  }, [locale]);

  // The parent remounts this drawer per entry (key = id), so state starts fresh.
  useEffect(() => {
    if (!id) return;
    (async () => {
      await load(id);
    })();
  }, [id, load]);

  const writable = !!detail && detail.periodStatus === "OPEN" && !detail.voidedAt;
  const canFix = writable && perms.update;
  const canVoid = writable && perms.void;

  async function openFile(attId: string) {
    const cached = urls[attId];
    if (isFresh(cached)) {
      window.open(cached.url, "_blank", "noopener");
      return;
    }
    // The thumbnail URL is stale: open the tab now, while the click still
    // counts as a user gesture (Safari blocks window.open after an await),
    // then point it at a freshly signed URL.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    const res = await apiFetch<Signed>(`/attachments/${attId}`);
    if (!res.ok) {
      tab?.close();
      setError(res.status === 0 ? tr("common.network") : res.error.message);
      return;
    }
    if (tab) tab.location.href = res.data.url;
  }

  async function doVoid() {
    if (!detail) return;
    setBusy(true);
    const res = await apiFetch(`/transactions/${detail.id}/void`, { method: "POST", body: { reason: reason.trim() } });
    setBusy(false);
    setVoidOpen(false);
    if (!res.ok) {
      setError(res.status === 0 ? tr("common.network") : res.error.message);
      return;
    }
    toast(tr("entry.toast.voided"));
    setReason("");
    await load(detail.id);
    onChanged();
  }

  async function addFiles(ids: string[], uploading: boolean) {
    if (!detail || uploading || !ids.length) return;
    const res = await apiFetch(`/transactions/${detail.id}/attachments`, { method: "POST", body: { attachmentIds: ids } });
    setPickerKey((k) => k + 1);
    if (!res.ok) {
      setError(res.status === 0 ? tr("common.network") : res.error.message);
      return;
    }
    toast(tr("entry.toast.files"));
    await load(detail.id);
    onChanged();
  }

  async function removeFile() {
    if (!detail || !removeId) return;
    setBusy(true);
    const res = await apiFetch(`/transactions/${detail.id}/attachments/${removeId}`, { method: "DELETE" });
    setBusy(false);
    setRemoveId(null);
    if (!res.ok) {
      setError(res.status === 0 ? tr("common.network") : res.error.message);
      return;
    }
    toast(tr("entry.toast.fileRemoved"));
    await load(detail.id);
    onChanged();
  }

  const rows: [MessageKey, string | null][] = detail
    ? [
        ["detail.row.month", monthLabel(locale, detail.period)],
        ["detail.row.date", longDate(locale, detail.txnDate)],
        ["detail.row.fund", detail.fundAccountName],
        ["detail.row.unit", detail.unitName ? [detail.unitName, detail.tenantName].filter(Boolean).join(" · ") : null],
        ["detail.row.vendor", detail.vendor],
        ["detail.row.description", detail.description],
        ["detail.row.reserve", detail.fromReserve ? tr("detail.yes") : null],
        ["detail.row.reference", detail.referencePeriod ? monthLabel(locale, detail.referencePeriod) : null],
        ["detail.row.recordedBy", detail.recordedBy],
      ]
    : [];
  const removing = detail?.attachments.find((a) => a.id === removeId);

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} aria-describedby={undefined} className="w-full gap-0 border-l-2 border-foreground bg-background p-0 sm:max-w-135">
        <SheetHeader className="flex-row items-start justify-between gap-3 border-b-2 border-foreground px-5 py-4">
          <div>
            <p className="kicker">{detail ? tr(detail.kind === "INCOME" ? "detail.income" : "detail.expense") : tr("detail.loading")}</p>
            <SheetTitle className="text-[22px] font-extrabold tracking-[-0.015em]">{detail ? categoryName(locale, detail.category) : "…"}</SheetTitle>
          </div>
          <SheetClose asChild>
            <Button ref={closeRef} variant="ghost" size="icon" aria-label={tr("common.close")}>
              <XMarkIcon />
            </Button>
          </SheetClose>
        </SheetHeader>
        <div className="form-stack flex-1 overflow-y-auto p-5" lang={locale}>
          <ErrorStrip message={error} />
          {detail ? (
            <>
              <p className={detail.voidedAt ? "m-0 text-[44px] leading-none font-extrabold tracking-[-0.04em] text-[var(--color-neutral-600)] line-through" : "m-0 text-[44px] leading-none font-extrabold tracking-[-0.04em]"}>
                {formatMoney(locale, detail.amountPaisa)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {detail.voidedAt ? <Badge variant="neutral">{tr("detail.voidTag", { reason: detail.voidReason ?? "" })}</Badge> : null}
                {detail.isCorrected ? <Badge variant="outline">{tr("entries.tag.corrected")}</Badge> : null}
                {detail.fromReserve ? <Badge variant="accent">{tr("entries.tag.reserve")}</Badge> : null}
                {detail.periodStatus === "CLOSED" ? (
                  <Badge variant="neutral">
                    <LockClosedIcon />
                    {tr("entries.tag.locked")}
                  </Badge>
                ) : null}
              </div>
              <dl className="kv">
                {rows
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt>{tr(k)}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
              </dl>

              <section className="flex flex-col gap-3">
                <div className="section-head">
                  <h3>{tr("entry.files")}</h3>
                </div>
                {detail.attachments.length ? (
                  <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                    {detail.attachments.map((a) => (
                      <li key={a.id} className="relative">
                        <button type="button" className="flex size-24 items-center justify-center border border-border bg-card" aria-label={tr("detail.open", { name: a.fileName })} onClick={() => openFile(a.id)}>
                          {a.mime.startsWith("image/") && urls[a.id] ? (
                            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from the private bucket
                            <img src={urls[a.id].url} alt="" className="size-full object-cover" />
                          ) : (
                            <DocumentIcon className="size-9" aria-hidden />
                          )}
                        </button>
                        {canFix ? (
                          <Button variant="ghost" size="icon" className="absolute -top-2 -right-2 size-7 bg-background" aria-label={tr("entry.files.remove", { name: a.fileName })} onClick={() => setRemoveId(a.id)}>
                            <XMarkIcon />
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted m-0">{tr("detail.noFiles")}</p>
                )}
                {canFix && detail.attachments.length < 5 ? <AttachmentPicker key={pickerKey} locale={locale} existing={detail.attachments.length} onChange={addFiles} /> : null}
              </section>

              <section className="flex flex-col gap-2">
                <div className="section-head">
                  <h3>{tr("detail.history")}</h3>
                </div>
                <ol className="m-0 flex list-none flex-col p-0">
                  {detail.history.map((h, i) => (
                    <li key={i} className="list-row flex-col items-start gap-0.5">
                      <span className="text-sm font-bold">{tr(`history.${h.action}` as MessageKey)}</span>
                      <span className="muted">
                        {[formatDateTime(locale, h.at), h.actorName].filter(Boolean).join(" · ")}
                      </span>
                      {changeLine(locale, h.before, h.after) ? <span className="text-sm">{changeLine(locale, h.before, h.after)}</span> : null}
                      {h.reason ? <span className="text-sm">“{h.reason}”</span> : null}
                    </li>
                  ))}
                </ol>
              </section>
            </>
          ) : null}
        </div>
        {canFix || canVoid ? (
          <SheetFooter className="flex-row justify-end gap-2 border-t border-border px-5 py-3">
            {canVoid ? (
              <Button variant="outline" onClick={() => setVoidOpen(true)}>
                {tr("detail.void")}
              </Button>
            ) : null}
            {canFix ? <Button onClick={() => detail && onCorrect(detail)}>{tr("detail.correct")}</Button> : null}
          </SheetFooter>
        ) : null}
      </SheetContent>

      {detail ? (
        <ConfirmDialog
          open={voidOpen}
          onOpenChange={setVoidOpen}
          title={tr("void.title")}
          description={tr("void.body", { month: monthLabel(locale, detail.period) })}
          confirmLabel={tr("void.confirm")}
          cancelLabel={tr("common.cancel")}
          busy={busy}
          confirmDisabled={reason.trim().length < 5}
          onConfirm={doVoid}
          returnFocusTo={() => closeRef.current}
        >
          <TextField id="void-reason" label={tr("void.reason")} placeholder={tr("void.ph")} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required />
        </ConfirmDialog>
      ) : null}
      {removing ? (
        <ConfirmDialog
          open={!!removeId}
          onOpenChange={(o) => !o && setRemoveId(null)}
          title={tr("entry.files.remove", { name: removing.fileName })}
          description={removing.fileName}
          confirmLabel={tr("settings.files.removeConfirm")}
          cancelLabel={tr("common.cancel")}
          busy={busy}
          onConfirm={removeFile}
          returnFocusTo={() => closeRef.current}
        />
      ) : null}
    </Sheet>
  );
}

/** "৳6,030 → ৳6,300" for amount changes; other fields as "field: a → b". */
function changeLine(locale: Locale, before: unknown, after: unknown): string | null {
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return null;
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const show = (k: string, v: unknown) => (v === null || v === undefined || v === "" ? "—" : k === "amountPaisa" && typeof v === "number" ? formatMoney(locale, v) : String(v));
  const parts = Object.keys(a)
    .filter((k) => !k.endsWith("Id") || k === "amountPaisa")
    .map((k) => (k === "amountPaisa" ? `${show(k, b[k])} → ${show(k, a[k])}` : `${k}: ${show(k, b[k])} → ${show(k, a[k])}`));
  return parts.length ? parts.join(" · ") : null;
}
