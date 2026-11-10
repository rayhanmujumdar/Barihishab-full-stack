"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ErrorStrip } from "@/components/forms/error-strip";
import { TextField } from "@/components/forms/fields";
import { apiFetch } from "@/lib/api/client";
import { useApiMutation } from "@/lib/api/query";
import { translator, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { loanLabel } from "./format";
import type { HistoryRow, LoanCardDto } from "./types";

export type LoanAction = { kind: "void"; loan: LoanCardDto; row: HistoryRow } | { kind: "cancel" | "writeoff"; loan: LoanCardDto };

/** F8 void a repayment, F9 cancel, F10 write off: confirmation with a reason everyone can read. */
export function LoanActionDialog({ locale, action, onClose, onDone }: { locale: Locale; action: LoanAction; onClose: () => void; onDone: () => void }) {
  const tr = translator(locale);
  const { loan } = action;
  const label = loanLabel(locale, loan.number);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const path =
    action.kind === "void" ? `/loans/${loan.id}/repayments/${action.row.id}/void` : action.kind === "cancel" ? `/loans/${loan.id}/cancel` : `/loans/${loan.id}/write-off`;
  const run = useApiMutation(["loans", action.kind, loan.id], (r: string) => apiFetch(path, { method: "POST", body: { reason: r } }));

  const text =
    action.kind === "void"
      ? { title: tr("al.void.title"), body: tr("al.void.body", { amount: formatMoney(locale, action.row.amountPaisa) }), confirm: tr("al.void.confirm"), toast: tr("al.toast.voided") }
      : action.kind === "cancel"
        ? { title: tr("al.cancel.title", { loan: label }), body: tr("al.cancel.body", { amount: formatMoney(locale, loan.principalPaisa) }), confirm: tr("al.cancelLoan"), toast: tr("al.toast.cancelled", { loan: label }) }
        : { title: tr("al.wo.title", { loan: label }), body: tr("al.wo.body", { amount: formatMoney(locale, loan.outstandingPaisa) }), confirm: tr("al.writeOff"), toast: tr("al.toast.writtenOff", { loan: label }) };

  async function confirm() {
    setError(null);
    const res = await run.run(reason.trim());
    if (!res.ok) return setError(res.status === 0 ? tr("common.network") : (res.error.details?.fields?.reason ?? res.error.message));
    toast(text.toast);
    onDone();
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={text.title}
      description={text.body}
      confirmLabel={text.confirm}
      cancelLabel={tr("common.cancel")}
      busy={run.isPending}
      confirmDisabled={!reason.trim()}
      onConfirm={confirm}
    >
      <ErrorStrip message={error} />
      <TextField id="loan-action-reason" label={tr("al.reason")} hint={tr("al.err.reason")} placeholder={tr("al.reasonPh")} required maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
    </ConfirmDialog>
  );
}
