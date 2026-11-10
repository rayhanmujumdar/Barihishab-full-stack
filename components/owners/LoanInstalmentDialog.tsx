"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ErrorStrip } from "@/components/forms/error-strip";
import { TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api/client";
import { qk, useApiMutation } from "@/lib/api/query";
import { translator, type Locale } from "@/lib/i18n";
import { formatMoney, paisaToInput, parseAmount } from "@/lib/money";
import type { LoanDto } from "@/lib/loans/loan-service";

/** Set or clear a loan's monthly instalment, deducted on month close (Distribution PRD F11), with a reason (Advances & Loans F7). */
export function LoanInstalmentDialog({ locale, loan, onClose, onDone }: { locale: Locale; loan: LoanDto; onClose: () => void; onDone: () => void }) {
  const tr = translator(locale);
  const [amount, setAmount] = useState(loan.installmentPaisa ? paisaToInput(loan.installmentPaisa) : "");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = useApiMutation(["owners", "loan-instalment", loan.id], (installmentPaisa: number | null) => apiFetch(`/loans/${loan.id}`, { method: "PATCH", body: { installmentPaisa, reason: reason.trim() } }), {
    invalidate: [qk.owners.all],
  });

  async function send(installmentPaisa: number | null) {
    setError(null);
    // Advances & Loans F7: every instalment change carries a reason all owners can read.
    if (!reason.trim()) return setReasonError(tr("al.err.reason"));
    setReasonError(null);
    const res = await save.run(installmentPaisa);
    if (!res.ok) {
      setFieldError(res.error.details?.fields?.installmentPaisa ?? null);
      return setError(res.status === 0 ? tr("common.network") : res.error.message);
    }
    toast(tr("loan.saved"));
    onDone();
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const paisa = parseAmount(amount);
    if (paisa === null || paisa > loan.outstandingPaisa) return setFieldError(tr("pay.err.amount"));
    setFieldError(null);
    await send(paisa);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{tr("loan.editTitle")}</DialogTitle>
          <DialogDescription>{tr("loan.outstanding", { amount: formatMoney(locale, loan.outstandingPaisa) })}</DialogDescription>
        </DialogHeader>
        <form className="form-stack" onSubmit={onSubmit} noValidate>
          <ErrorStrip message={error} />
          <TextField id="loan-instalment" label={tr("loan.instalment")} hint={tr("loan.instalmentHint")} inputMode="decimal" required value={amount} error={fieldError ?? undefined} onChange={(e) => setAmount(e.target.value)} />
          <TextField id="loan-instalment-reason" label={tr("loan.reason")} placeholder={tr("al.reasonPh")} required maxLength={300} value={reason} error={reasonError ?? undefined} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            {loan.installmentPaisa ? (
              <Button type="button" variant="outline" disabled={save.isPending} onClick={() => send(null)}>
                {tr("loan.clear")}
              </Button>
            ) : null}
            <Button type="submit" disabled={save.isPending}>
              {tr("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
