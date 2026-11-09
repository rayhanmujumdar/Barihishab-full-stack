"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ErrorStrip } from "@/components/forms/error-strip";
import { DateField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { apiFetch } from "@/lib/api/client";
import { apiGet, qk, queryErrorMessage, useApiMutation } from "@/lib/api/query";
import { todayIsoInDhaka } from "@/lib/clock";
import { translator, type Locale } from "@/lib/i18n";
import { formatMoney, paisaToInput, parseAmount } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import type { EntriesData } from "./types";
import { newIdempotencyKey } from "./upload";

type DraftRow = { unitId: string; unit: string; tenant: string | null; amountPaisa: number; fundAccountId: string | null };
type Row = { unitId: string; unit: string; tenant: string | null; checked: boolean; amount: string; fundAccountId: string };

/** Generate rent dialog (INC-04, PRD §6.5): preview → edit → save in one transaction. */
export function GenerateRentDialog({ locale, data, onClose, onSaved }: { locale: Locale; data: EntriesData; onClose: () => void; onSaved: () => void }) {
  const tr = translator(locale);
  const period = data.status === "OPEN" ? data.month : (data.latestOpen ?? data.month);
  // Rows the user has edited; until then they come straight from the preview.
  const [edited, setEdited] = useState<Row[] | null>(null);
  const [txnDate, setTxnDate] = useState(() => {
    const today = todayIsoInDhaka();
    return today.startsWith(period) ? today : today > period ? `${period}-28` : today;
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [key] = useState(newIdempotencyKey);
  const funds = data.funds.filter((f) => f.isActive);

  // The preview is a read (POST only to carry the body): cached per month and
  // re-checked on every open, since entries may have changed in the meantime.
  const preview = useQuery({
    queryKey: qk.transactions.rentPreview(period),
    queryFn: () => apiGet<{ rows: DraftRow[] }>("/transactions/generate-rent/preview", { method: "POST", body: { period } }),
    staleTime: 0,
    // Don't swap the rows under the user when they tab back in.
    refetchOnWindowFocus: false,
  });
  const fromPreview: Row[] | null = preview.data
    ? preview.data.rows.map((r) => ({ unitId: r.unitId, unit: r.unit, tenant: r.tenant, checked: true, amount: paisaToInput(r.amountPaisa), fundAccountId: r.fundAccountId ?? funds[0]?.id ?? "" }))
    : preview.isError
      ? []
      : null;
  const rows = edited ?? fromPreview;
  const error = saveError ?? queryErrorMessage(preview.error, tr("common.network"));

  const generate = useApiMutation(
    ["transactions", "generate-rent"],
    (body: { period: string; txnDate: string; rows: { unitId: string; amountPaisa: number; fundAccountId: string }[] }) =>
      apiFetch<{ created: number; skipped: { unit: string }[] }>("/transactions/generate-rent", { method: "POST", headers: { "Idempotency-Key": key }, body }),
    { invalidate: [qk.transactions.all] },
  );
  const pending = generate.isPending;

  const ticked = (rows ?? []).filter((r) => r.checked);
  const total = ticked.reduce((s, r) => s + (parseAmount(r.amount) ?? 0), 0);
  const invalid = !txnDate || ticked.some((r) => !parseAmount(r.amount) || !r.fundAccountId);
  const update = (i: number, patch: Partial<Row>) => setEdited(rows!.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  async function save() {
    if (!ticked.length || invalid || pending) return;
    setSaveError(null);
    const res = await generate.run({ period, txnDate, rows: ticked.map((r) => ({ unitId: r.unitId, amountPaisa: parseAmount(r.amount)!, fundAccountId: r.fundAccountId })) });
    if (!res.ok) {
      setSaveError(res.status === 0 ? tr("common.network") : res.error.message);
      return;
    }
    toast(tr("rent.toast", { count: res.data.created }));
    if (res.data.skipped.length) toast.warning(tr("rent.skipped", { units: res.data.skipped.map((s) => s.unit).join(", ") }));
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] gap-4 overflow-y-auto rounded-none sm:max-w-[620px]" lang={locale}>
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">{tr("rent.title", { month: monthLabel(locale, period) })}</DialogTitle>
          <DialogDescription>{rows && !rows.length && !error ? tr("rent.empty") : tr("rent.body")}</DialogDescription>
        </DialogHeader>
        <ErrorStrip message={error} />
        {rows === null ? <p className="muted">{tr("common.loading")}</p> : null}
        {rows?.length ? (
          <>
            <DateField id="rent-date" label={tr("rent.date")} placeholder={tr("entry.ph.date")} clearLabel={tr("common.clear")} locale={locale} disableFuture fromYear={2020} value={txnDate} onChange={setTxnDate} required requiredText={tr("common.required")} />
            <ul className="m-0 list-none border-t-2 border-foreground p-0" aria-label={tr("rent.title", { month: monthLabel(locale, period) })}>
              {rows.map((r, i) => (
                <li key={r.unitId} className="list-row flex-wrap">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <Checkbox id={`rent-${r.unitId}`} checked={r.checked} onCheckedChange={(v) => update(i, { checked: v === true })} aria-label={tr("rent.include", { unit: r.unit })} />
                    <label htmlFor={`rent-${r.unitId}`} className="min-w-0">
                      <span className="block font-bold">{r.unit}</span>
                      {r.tenant ? <span className="muted block truncate">{r.tenant}</span> : null}
                    </label>
                  </div>
                  <NativeSelect className="w-40" value={r.fundAccountId} onChange={(e) => update(i, { fundAccountId: e.target.value })} aria-label={tr("rent.fundFor", { unit: r.unit })} disabled={!r.checked}>
                    {funds.map((f) => (
                      <NativeSelectOption key={f.id} value={f.id}>
                        {f.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <Input className="w-[140px] text-right font-extrabold" inputMode="decimal" value={r.amount} onChange={(e) => update(i, { amount: e.target.value })} aria-label={tr("rent.amountFor", { unit: r.unit })} aria-invalid={r.checked && !parseAmount(r.amount) ? true : undefined} disabled={!r.checked} />
                </li>
              ))}
            </ul>
            <div className="entry-total">
              <span>{tr("rent.total")}</span>
              <span className="entry-amount" data-testid="rent-total">
                {formatMoney(locale, total)}
              </span>
            </div>
          </>
        ) : null}
        <DialogFooter className="flex-row justify-end gap-2">
          {rows?.length ? (
            <>
              <Button variant="outline" onClick={onClose}>
                {tr("common.cancel")}
              </Button>
              <Button onClick={save} disabled={!ticked.length || invalid || pending}>
                {tr("rent.save")}
              </Button>
            </>
          ) : (
            <Button onClick={onClose}>{tr("rent.done")}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
