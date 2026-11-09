"use client";

import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { newIdempotencyKey } from "@/components/entries/upload";
import { ErrorStrip } from "@/components/forms/error-strip";
import { RequiredLegend, SelectField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { apiFetch, fieldErrors } from "@/lib/api/client";
import { qk, useApiMutation } from "@/lib/api/query";
import { translator, type Locale } from "@/lib/i18n";
import { monthLabel } from "@/lib/periods/month";
import { num, percent } from "./format";
import type { OwnersData } from "./types";

type Row = { ownerId: string; name: string; before: number; units: string };

const WHOLE = /^\d{1,7}$/;
const unitsOf = (r: Row) => (r.units.trim() === "" ? 0 : WHOLE.test(r.units.trim()) ? Number(r.units.trim()) : NaN);

/** Change shares (Owners PRD F6): a new share set for every owner, from the 1st of a month. */
export function ChangeSharesDialog({ locale, data, onClose, onSaved }: { locale: Locale; data: OwnersData; onClose: () => void; onSaved: () => void }) {
  const tr = translator(locale);
  const all = [...data.list.owners, ...data.list.formerOwners];
  const [rows, setRows] = useState<Row[]>(() =>
    data.list.owners.filter((o) => o.units > 0).map((o) => ({ ownerId: o.id, name: o.displayName, before: o.units, units: String(o.units) })),
  );
  const [month, setMonth] = useState(data.effectiveMonths[0] ?? "");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const saveShares = useApiMutation(["owners", "shares"], (v: { body: Record<string, unknown>; key: string }) =>
    apiFetch<{ shareSet: { effectiveMonth: string } }>("/owners/shares", { method: "POST", body: v.body, headers: { "Idempotency-Key": v.key } }), { invalidate: [qk.owners.all] });
  // One key per distinct body: a retry of the same save replays, an edited save is a new request.
  const sent = useRef<{ body: string; key: string } | null>(null);

  const addable = all.filter((o) => !rows.some((r) => r.ownerId === o.id));
  const parsed = rows.map(unitsOf);
  const total = parsed.reduce((sum, u) => sum + (Number.isNaN(u) ? 0 : u), 0);
  const changed = rows.filter((r, i) => parsed[i] !== r.before);

  const setUnits = (ownerId: string, units: string) => {
    setRows((rs) => rs.map((r) => (r.ownerId === ownerId ? { ...r, units } : r)));
    setErrors((e) => ({ ...e, items: "" }));
  };

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (parsed.some(Number.isNaN)) e.items = tr("shares.err.units");
    else if (total <= 0) e.items = tr("shares.err.total");
    else if (!changed.length) e.items = tr("shares.err.noChange");
    if (!reason.trim()) e.reason = tr("shares.err.reason");
    return e;
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (!Object.values(e).some(Boolean)) setConfirming(true);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const body = { effectiveMonth: month, reason: reason.trim(), items: rows.map((r, i) => ({ ownerId: r.ownerId, units: parsed[i] })) };
    const json = JSON.stringify(body);
    if (sent.current?.body !== json) sent.current = { body: json, key: newIdempotencyKey() };
    const res = await saveShares.run({ body, key: sent.current.key });
    setBusy(false);
    setConfirming(false);
    if (!res.ok) {
      const fields = fieldErrors(res);
      if (res.error.code === "PERIOD_CLOSED" || fields.effectiveMonth) {
        setErrors({ effectiveMonth: res.error.code === "PERIOD_CLOSED" ? tr("shares.err.closed") : fields.effectiveMonth });
      } else if (fields.reason) setErrors({ reason: tr("shares.err.reason") });
      else if (fields.items) setErrors({ items: fields.items });
      else setError(res.status === 0 ? tr("common.network") : res.error.message);
      return;
    }
    toast(tr("shares.toast", { month: monthLabel(locale, res.data.shareSet.effectiveMonth) }));
    onSaved();
  }

  const monthText = month ? monthLabel(locale, month) : "";

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] gap-4 overflow-y-auto rounded-none sm:max-w-[620px]" lang={locale}>
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">{tr("shares.title")}</DialogTitle>
          <DialogDescription>{tr("shares.body")}</DialogDescription>
        </DialogHeader>
        <form id="shares-form" className="form-stack" onSubmit={onSubmit} noValidate>
          <ErrorStrip message={error} />
          <RequiredLegend text={tr("common.required")} />
          <ul className="m-0 list-none border-t-2 border-foreground p-0" aria-describedby={errors.items ? "shares-items-error" : undefined}>
            {rows.map((r, i) => (
              <li key={r.ownerId} className="list-row py-2">
                <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                <Input
                  aria-label={tr("shares.units", { name: r.name })}
                  inputMode="numeric"
                  className="w-24 text-right font-extrabold tabular-nums"
                  value={r.units}
                  onChange={(e) => setUnits(r.ownerId, e.target.value)}
                  aria-invalid={Number.isNaN(parsed[i]) || undefined}
                />
                <span className="w-16 text-right font-bold tabular-nums" data-testid={`pct-${r.ownerId}`}>
                  {percent(locale, total > 0 && !Number.isNaN(parsed[i]) ? (parsed[i] * 100) / total : 0)}
                </span>
              </li>
            ))}
          </ul>
          <p className="m-0 font-extrabold">{tr("shares.total", { n: total })}</p>
          {errors.items ? (
            <p id="shares-items-error" role="alert" className="m-0 text-xs font-semibold text-destructive">
              {errors.items}
            </p>
          ) : null}
          {addable.length ? (
            <NativeSelect
              aria-label={tr("shares.add")}
              value=""
              onChange={(e) => {
                const o = all.find((x) => x.id === e.target.value);
                if (o) setRows((rs) => [...rs, { ownerId: o.id, name: o.displayName, before: o.units, units: "" }]);
              }}
            >
              <NativeSelectOption value="">+ {tr("shares.add")}</NativeSelectOption>
              {addable.map((o) => (
                <NativeSelectOption key={o.id} value={o.id}>
                  {o.displayName}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          ) : null}
          <SelectField
            id="shares-month"
            label={tr("shares.effective")}
            required
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            error={errors.effectiveMonth}
            options={data.effectiveMonths.map((m) => ({ value: m, label: monthLabel(locale, m) }))}
          />
          <TextField
            id="shares-reason"
            label={tr("shares.reason")}
            hint={tr("shares.reasonHint")}
            placeholder={tr("shares.reasonHint")}
            required
            maxLength={300}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setErrors((x) => ({ ...x, reason: "" }));
            }}
            error={errors.reason}
          />
        </form>
        <DialogFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {tr("common.cancel")}
          </Button>
          <Button type="submit" form="shares-form" disabled={busy}>
            {tr("shares.save")}
          </Button>
        </DialogFooter>
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          tone="default"
          title={tr("shares.confirm.title")}
          description={tr("shares.confirm.body", { month: monthText })}
          confirmLabel={tr("shares.save")}
          cancelLabel={tr("common.cancel")}
          busy={busy}
          onConfirm={save}
        >
          <ul className="m-0 list-none border-t-2 border-foreground p-0">
            {changed.map((r) => (
              <li key={r.ownerId} className="list-row py-2">
                <span className="font-semibold">{r.name}</span>
                <span className="font-extrabold tabular-nums">{`${num(locale, r.before)} → ${num(locale, unitsOf(r))}`}</span>
              </li>
            ))}
          </ul>
          {changed
            .filter((r) => r.before > 0 && unitsOf(r) === 0)
            .map((r) => (
              <p key={r.ownerId} className="m-0 text-sm font-semibold">
                {tr("shares.confirm.former", { name: r.name, month: monthText })}
              </p>
            ))}
        </ConfirmDialog>
      </DialogContent>
    </Dialog>
  );
}
