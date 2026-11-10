"use client";

import { useState, type FormEvent } from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { newIdempotencyKey } from "@/components/entries/upload";
import { ErrorStrip } from "@/components/forms/error-strip";
import { DateField, SelectField, TextField } from "@/components/forms/fields";
import { Choice } from "@/components/owners/Choice";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { planInstalment } from "@/lib/accounting/requests";
import { apiFetch } from "@/lib/api/client";
import { useApiMutation } from "@/lib/api/query";
import { todayIsoInDhaka } from "@/lib/clock";
import { translator, type Locale, type MessageKey } from "@/lib/i18n";
import { formatMoney, paisaToInput, parseAmount } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import { reqNumber, typeLabel } from "./format";
import type { FundOption, RequestDto } from "./types";

type Method = "CASH" | "BANK" | "BKASH" | "NAGAD";
const METHODS: Method[] = ["CASH", "BANK", "BKASH", "NAGAD"];

const fail = (res: { status: number; error: { message: string; details?: { fields?: Record<string, string> } } }, network: string) => ({
  fields: res.error.details?.fields ?? {},
  message: res.status === 0 ? network : res.error.message,
});

/** F5: approve the full or a lower amount; lower needs a note; optional "disburse now". */
export function ApproveDialog({ locale, request: r, canDisburse, onClose, onDone }: { locale: Locale; request: RequestDto; canDisburse: boolean; onClose: () => void; onDone: (disburseNow: RequestDto | null) => void }) {
  const tr = translator(locale);
  const [amount, setAmount] = useState(paisaToInput(r.amountRequestedPaisa));
  const [note, setNote] = useState("");
  const [now, setNow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const save = useApiMutation(["requests", "approve", r.id], (body: Record<string, unknown>) => apiFetch<{ request: RequestDto }>(`/requests/${r.id}/approve`, { method: "POST", body }));
  const requested = formatMoney(locale, r.amountRequestedPaisa);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (save.isPending) return;
    const paisa = parseAmount(amount);
    const e: Record<string, string> = {};
    if (!paisa || paisa < 100 || paisa > r.amountRequestedPaisa) e.amountPaisa = tr("req.err.approveRange", { amount: requested });
    else if (paisa < r.amountRequestedPaisa && !note.trim()) e.note = tr("req.err.lowerNote");
    setErrors(e);
    if (Object.keys(e).length) return;
    setError(null);
    const res = await save.run({ amountPaisa: paisa, note: note.trim() || null });
    if (!res.ok) {
      const f = fail(res, tr("common.network"));
      setErrors(f.fields);
      return setError(Object.keys(f.fields).length ? null : f.message);
    }
    toast(tr("req.toast.approved"));
    onDone(now ? res.data.request : null);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-[480px]" lang={locale}>
        <DialogHeader>
          <DialogTitle>{tr("req.approve.title", { number: reqNumber(locale, r.number) })}</DialogTitle>
          <DialogDescription>{tr("req.approve.body", { name: r.ownerName, amount: requested, type: typeLabel(locale, r.type) })}</DialogDescription>
        </DialogHeader>
        <form id="approve-form" className="form-stack" onSubmit={onSubmit} noValidate>
          <ErrorStrip message={error} />
          {r.isSelf ? <p className="m-0 font-semibold">{tr("req.approve.self")}</p> : null}
          <TextField id="approve-amount" label={tr("req.approve.amount")} inputMode="decimal" required className="amount-input" value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.amountPaisa} />
          <TextField id="approve-note" label={tr("req.approve.note")} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} error={errors.note} />
          {canDisburse ? (
            <div className="flex min-h-11 items-center gap-2">
              <Checkbox id="approve-now" checked={now} onCheckedChange={(c) => setNow(c === true)} />
              <Label htmlFor="approve-now" className="text-sm font-semibold">
                {tr("req.approve.now")}
              </Label>
            </div>
          ) : null}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            {tr("common.cancel")}
          </Button>
          <Button type="submit" form="approve-form" disabled={save.isPending}>
            {tr("req.approve")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** F6 reject, F8 withdraw approval, F3 cancel: a confirmation, with a required reason for the first two. */
export function ReasonDialog({ locale, kind, request: r, onClose, onDone }: { locale: Locale; kind: "reject" | "withdraw" | "cancel"; request: RequestDto; onClose: () => void; onDone: () => void }) {
  const tr = translator(locale);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const run = useApiMutation(["requests", kind, r.id], (body: Record<string, unknown>) => apiFetch(`/requests/${r.id}/${kind}`, { method: "POST", body }));
  const needsReason = kind !== "cancel";
  const number = reqNumber(locale, r.number);

  async function confirm() {
    setError(null);
    const res = await run.run(needsReason ? { reason: reason.trim() } : {});
    if (!res.ok) return setError(res.status === 0 ? tr("common.network") : (res.error.details?.fields?.reason ?? res.error.message));
    toast(tr(`req.toast.${kind}` as MessageKey));
    onDone();
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={tr(`req.${kind}.title` as MessageKey, { number })}
      description={tr(`req.${kind}.body` as MessageKey, { name: r.ownerName, number })}
      confirmLabel={tr(`req.${kind}.confirm` as MessageKey)}
      cancelLabel={tr("req.keep")}
      busy={run.isPending}
      confirmDisabled={needsReason && !reason.trim()}
      onConfirm={confirm}
    >
      <ErrorStrip message={error} />
      {needsReason ? (
        <TextField id={`req-${kind}-reason`} label={tr("req.reason")} hint={tr("req.err.reasonFor", { name: r.ownerName })} required maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      ) : null}
    </ConfirmDialog>
  );
}

/** F7: pay out an approved request into the right ledger. */
export function DisburseDialog({ locale, request: r, funds, openMonth, onClose, onDone }: { locale: Locale; request: RequestDto; funds: FundOption[]; openMonth: string | null; onClose: () => void; onDone: () => void }) {
  const tr = translator(locale);
  const amount = r.amountApprovedPaisa ?? r.amountRequestedPaisa;
  const [date, setDate] = useState(todayIsoInDhaka());
  const [fundId, setFundId] = useState(funds[0]?.id ?? "");
  const [method, setMethod] = useState<Method>("CASH");
  const [ref, setRef] = useState("");
  const plan = planInstalment(r.repaymentPlan);
  const [instalment, setInstalment] = useState(plan ? paisaToInput(Math.min(plan, amount)) : "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(newIdempotencyKey);
  const save = useApiMutation(["requests", "disburse", r.id], (body: Record<string, unknown>) =>
    apiFetch(`/requests/${r.id}/disburse`, { method: "POST", body, headers: { "Idempotency-Key": key } }),
  );
  const fund = funds.find((f) => f.id === fundId);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (save.isPending || !openMonth) return;
    const e: Record<string, string> = {};
    if (!date || date > todayIsoInDhaka()) e.date = tr("pay.err.date");
    if (!fundId) e.fundAccountId = tr("pay.err.fund");
    if (method !== "CASH" && !ref.trim()) e.referenceNo = tr("pay.err.ref");
    const inst = instalment.trim() ? parseAmount(instalment) : null;
    if (r.type === "LOAN" && instalment.trim() && (!inst || inst > amount)) e.installmentPaisa = tr("req.err.instalment");
    setErrors(e);
    if (Object.keys(e).length) return;
    setError(null);
    const res = await save.run({ date, fundAccountId: fundId, method, referenceNo: ref.trim() || null, ...(r.type === "LOAN" ? { installmentPaisa: inst } : {}) });
    if (!res.ok) {
      const f = fail(res, tr("common.network"));
      setErrors(f.fields);
      return setError(Object.keys(f.fields).length ? null : f.message);
    }
    toast(tr("req.toast.disbursed"));
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      {/* Pinned header + footer, only the form body scrolls — the last field can never slide under the actions. */}
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[600px]" lang={locale}>
        <DialogHeader className="gap-1 border-b-2 border-[var(--color-text)] px-6 pt-6 pr-14 pb-4">
          <DialogTitle className="text-xl leading-tight font-extrabold tracking-[-0.015em]">{tr(`req.disburse.${r.type}` as MessageKey)}</DialogTitle>
          <DialogDescription className="text-[13px] text-[var(--color-neutral-700)]">{tr("req.disburse.sub", { number: reqNumber(locale, r.number), name: r.ownerName })}</DialogDescription>
        </DialogHeader>
        <form id="disburse-form" className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5" onSubmit={onSubmit} noValidate>
          <ErrorStrip message={error ?? (openMonth ? null : tr("req.err.noMonth"))} />
          <dl className="m-0 grid grid-cols-1 border-t-2 border-[var(--color-text)] sm:grid-cols-2">
            <div className="bg-[var(--signal)] px-4 py-3 text-[var(--color-text)]">
              <dt className="text-[11px] font-semibold tracking-[0.1em] uppercase">{tr("req.disburse.amount")}</dt>
              <dd className="m-0 text-[28px] leading-tight font-extrabold tracking-[-0.03em] tabular-nums">{formatMoney(locale, amount)}</dd>
            </div>
            <div className="border-b border-[var(--color-divider)] px-4 py-3 sm:border-b-0">
              {r.type === "GRANT" && openMonth ? (
                <>
                  <dt className="kicker">{tr("req.disburse.month")}</dt>
                  <dd className="m-0 text-lg leading-tight font-extrabold">{monthLabel(locale, openMonth)}</dd>
                </>
              ) : (
                <>
                  <dt className="kicker">{tr("req.disburse.to")}</dt>
                  <dd className="m-0 truncate text-lg leading-tight font-extrabold">{r.ownerName}</dd>
                </>
              )}
            </div>
          </dl>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DateField
              id="disburse-date"
              label={tr("pay.date")}
              required
              requiredText={tr("common.required")}
              placeholder={tr("pay.datePh")}
              clearLabel={tr("common.clear")}
              locale={locale}
              disableFuture
              fromYear={2020}
              value={date}
              onChange={setDate}
              error={errors.date}
            />
            <SelectField
              id="disburse-fund"
              label={tr("req.disburse.fund")}
              required
              value={fundId}
              onChange={(e) => setFundId(e.target.value)}
              error={errors.fundAccountId}
              options={[{ value: "", label: tr("pay.choose") }, ...funds.map((f) => ({ value: f.id, label: tr("pay.fundOption", { name: f.name, balance: formatMoney(locale, f.balancePaisa) }) }))]}
            />
          </div>
          {fund && amount > fund.balancePaisa ? (
            <Alert variant="destructive" className="rounded-none">
              <ExclamationTriangleIcon />
              <AlertDescription>{tr("req.warn.fundLow", { fund: fund.name, amount: formatMoney(locale, fund.balancePaisa) })}</AlertDescription>
            </Alert>
          ) : null}
          <Choice id="disburse-method" variant="seg" label={tr("pay.method")} value={method} onChange={setMethod} options={METHODS.map((x) => ({ value: x, label: tr(`method.${x}` as MessageKey) }))} />
          <TextField id="disburse-ref" label={tr("pay.ref")} placeholder={tr("pay.refPh")} required={method !== "CASH"} maxLength={60} value={ref} onChange={(e) => setRef(e.target.value)} error={errors.referenceNo} />
          {r.type === "LOAN" ? (
            <TextField
              id="disburse-instalment"
              label={tr("req.disburse.instalment")}
              hint={tr("req.disburse.instalmentHint")}
              inputMode="decimal"
              className="[&_input]:h-12 [&_input]:text-xl [&_input]:font-extrabold [&_input]:tabular-nums"
              value={instalment}
              onChange={(e) => setInstalment(e.target.value)}
              error={errors.installmentPaisa}
            />
          ) : null}
          {r.type === "GRANT" ? <p className="m-0 border-t-2 border-[var(--signal)] bg-[var(--color-surface)] px-3.5 py-3 text-[13px] text-[var(--color-neutral-800)]">{tr("req.disburse.grantNote")}</p> : null}
        </form>
        <DialogFooter className="mx-0 mb-0 rounded-none border-t-2 border-[var(--color-text)] bg-[var(--color-bg)] px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            {tr("common.cancel")}
          </Button>
          <Button type="submit" form="disburse-form" disabled={save.isPending || !openMonth}>
            {tr("req.disburse.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
