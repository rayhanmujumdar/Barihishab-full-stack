"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { newIdempotencyKey } from "@/components/entries/upload";
import { ErrorStrip } from "@/components/forms/error-strip";
import { RequiredLegend, SelectField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api/client";
import { qk, useApiMutation } from "@/lib/api/query";
import { translator, type Locale, type MessageKey } from "@/lib/i18n";
import { formatMoney, parseAmount } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import { Choice } from "./Choice";
import type { LedgerEntryDto } from "./types";

/** Void a payout or advance (F13): a reversal in the open month; reason required. */
export function VoidLedgerDialog({ locale, entry, month, onClose, onDone }: { locale: Locale; entry: LedgerEntryDto; month: string; onClose: () => void; onDone: () => void }) {
  const tr = translator(locale);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voidLedger = useApiMutation(["owners", "void-ledger"], (v: { id: string; reason: string }) => apiFetch(`/ledger/${v.id}/void`, { method: "POST", body: { reason: v.reason } }), { invalidate: [qk.owners.all] });

  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await voidLedger.run({ id: entry.id, reason: reason.trim() });
    setBusy(false);
    if (!res.ok) return setError(res.status === 0 ? tr("common.network") : res.error.message);
    toast(tr("lvoid.toast"));
    onDone();
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={tr(`lvoid.title.${entry.type}` as MessageKey)}
      description={tr("lvoid.body", { amount: formatMoney(locale, Math.abs(entry.amountPaisa)), month: monthLabel(locale, month) })}
      confirmLabel={tr("lvoid.confirm")}
      cancelLabel={tr("common.cancel")}
      busy={busy}
      confirmDisabled={!reason.trim()}
      onConfirm={confirm}
    >
      <ErrorStrip message={error} />
      <TextField
        id="lvoid-reason"
        label={tr("lvoid.reason")}
        hint={tr("pay.err.reason")}
        placeholder={tr("lvoid.reasonPh")}
        required
        maxLength={300}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
    </ConfirmDialog>
  );
}

/** Owner balance adjustment (F14): ± amount, reference month, reason; no House Fund effect. */
export function AdjustmentDialog({
  locale,
  ownerId,
  month,
  periodMonths,
  onClose,
  onDone,
}: {
  locale: Locale;
  ownerId: string;
  month: string;
  periodMonths: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const tr = translator(locale);
  const [sign, setSign] = useState<"plus" | "minus">("plus");
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key] = useState(newIdempotencyKey);
  const adjust = useApiMutation(["owners", "adjustment"], (body: Record<string, unknown>) => apiFetch("/adjustments", { method: "POST", body, headers: { "Idempotency-Key": key } }), { invalidate: [qk.owners.all] });
  const months = periodMonths.filter((m) => m <= month).sort().reverse();

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const paisa = parseAmount(amount);
    const e: Record<string, string> = {};
    if (!paisa) e.amount = tr("pay.err.amount");
    if (!ref) e.ref = tr("adj.err.ref");
    if (!reason.trim()) e.reason = tr("pay.err.reason");
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setError(null);
    const res = await adjust.run({ ownerId, amountPaisa: sign === "plus" ? paisa : -paisa!, referenceMonth: ref, reason: reason.trim() });
    setBusy(false);
    if (!res.ok) return setError(res.status === 0 ? tr("common.network") : res.error.message);
    toast(tr("adj.toast"));
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="gap-4 rounded-none sm:max-w-[520px]" lang={locale}>
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">{tr("adj.title")}</DialogTitle>
          <DialogDescription>{tr("adj.body", { month: monthLabel(locale, month) })}</DialogDescription>
        </DialogHeader>
        <form id="adj-form" className="form-stack" onSubmit={onSubmit} noValidate>
          <ErrorStrip message={error} />
          <RequiredLegend text={tr("common.required")} />
          <Choice
            id="adj-sign"
            label={tr("adj.direction")}
            value={sign}
            onChange={setSign}
            options={[
              { value: "plus", label: tr("adj.plus") },
              { value: "minus", label: tr("adj.minus") },
            ]}
          />
          <div className="grid-2">
            <TextField id="adj-amount" label={tr("adj.amount")} required inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.amount} />
            <SelectField
              id="adj-ref"
              label={tr("adj.ref")}
              required
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              error={errors.ref}
              options={[{ value: "", label: tr("pay.choose") }, ...months.map((m) => ({ value: m, label: monthLabel(locale, m) }))]}
            />
          </div>
          <TextField id="adj-reason" label={tr("adj.reason")} placeholder={tr("adj.reasonPh")} required maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} />
        </form>
        <DialogFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {tr("common.cancel")}
          </Button>
          <Button type="submit" form="adj-form" disabled={busy}>
            {tr("adj.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
