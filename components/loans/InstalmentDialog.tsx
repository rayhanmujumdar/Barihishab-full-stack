"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ErrorStrip } from "@/components/forms/error-strip";
import { TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { expectedFinish } from "@/lib/accounting/loans";
import { apiFetch } from "@/lib/api/client";
import { qk, useApiMutation } from "@/lib/api/query";
import { translator, type Locale } from "@/lib/i18n";
import { formatMoney, paisaToInput, parseAmount } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import { loanLabel } from "./format";

export type InstalmentLoan = { id: string; number: number; status: "ACTIVE" | "REPAID" | "WRITTEN_OFF" | "CANCELLED"; outstandingPaisa: number; installmentPaisa: number | null; disbursedOn: string };

/** F7: new amount or Manual, a required reason, and the new finish month before saving. */
export function InstalmentDialog({ locale, loan, openMonth, onClose, onDone }: { locale: Locale; loan: InstalmentLoan; openMonth: string | null; onClose: () => void; onDone: () => void }) {
  const tr = translator(locale);
  const label = loanLabel(locale, loan.number);
  const [amount, setAmount] = useState(loan.installmentPaisa ? paisaToInput(loan.installmentPaisa) : "");
  const [manual, setManual] = useState(!loan.installmentPaisa);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const save = useApiMutation(["loans", "instalment", loan.id], (body: { installmentPaisa: number | null; reason: string }) => apiFetch(`/loans/${loan.id}`, { method: "PATCH", body }), {
    invalidate: [qk.owners.all],
  });
  const paisa = manual ? null : parseAmount(amount);
  const schedule = !manual && paisa && paisa <= loan.outstandingPaisa ? expectedFinish({ ...loan, status: "ACTIVE", installmentPaisa: paisa, earliestOpenMonth: openMonth }) : null;

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (!manual && (!paisa || paisa > loan.outstandingPaisa)) e.installmentPaisa = tr("pay.err.amount");
    if (!reason.trim()) e.reason = tr("al.err.reason");
    setErrors(e);
    if (Object.keys(e).length) return;
    setError(null);
    const res = await save.run({ installmentPaisa: paisa, reason: reason.trim() });
    if (!res.ok) {
      setErrors(res.error.details?.fields ?? {});
      return setError(res.status === 0 ? tr("common.network") : res.error.message);
    }
    toast(tr("al.inst.toast"));
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-[480px]" lang={locale}>
        <DialogHeader>
          <DialogTitle>{tr("al.inst.title", { loan: label })}</DialogTitle>
          <DialogDescription>
            {tr("loan.outstanding", { amount: formatMoney(locale, loan.outstandingPaisa) })} · {tr("al.inst.starts")}
          </DialogDescription>
        </DialogHeader>
        <form id="inst-form" className="form-stack" onSubmit={onSubmit} noValidate>
          <ErrorStrip message={error} />
          <div className="flex items-center gap-2">
            <Checkbox id="inst-manual" checked={manual} onCheckedChange={(v) => setManual(v === true)} />
            <Label htmlFor="inst-manual" className="font-semibold">
              {tr("al.inst.manual")}
            </Label>
          </div>
          {!manual ? (
            <TextField id="inst-amount" label={tr("al.inst.amount")} inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.installmentPaisa} />
          ) : null}
          <p className="m-0 font-semibold">{schedule ? tr("al.inst.finish", { month: monthLabel(locale, schedule.finishMonth) }) : tr("al.inst.noFinish")}</p>
          <TextField
            id="inst-reason"
            label={tr("al.reason")}
            placeholder={tr("al.form.reasonPh")}
            required
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={errors.reason}
          />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            {tr("common.cancel")}
          </Button>
          <Button type="submit" form="inst-form" disabled={save.isPending}>
            {tr("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
