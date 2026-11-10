"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { newIdempotencyKey } from "@/components/entries/upload";
import { ErrorStrip } from "@/components/forms/error-strip";
import { DateField, SelectField, TextField } from "@/components/forms/fields";
import { Choice } from "@/components/owners/Choice";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { repaymentCap } from "@/lib/accounting/loans";
import { apiFetch } from "@/lib/api/client";
import { useApiMutation } from "@/lib/api/query";
import { todayIsoInDhaka } from "@/lib/clock";
import { translator, type Locale, type MessageKey } from "@/lib/i18n";
import { formatMoney, paisaToInput, parseAmount } from "@/lib/money";
import { isAfterTomorrow } from "@/lib/transactions/rules";
import { loanLabel } from "./format";
import type { FundOption, LoanCardDto, StandingDto } from "./types";

type Mode = "CASH" | "DEDUCTION";
type Method = "CASH" | "BANK" | "BKASH" | "NAGAD";
const METHODS: Method[] = ["CASH", "BANK", "BKASH", "NAGAD"];

/** F5: cash into the fund or deduction from entitlement; refuses above the outstanding (G1) or the balance (G2). */
export function RepaymentDialog({
  locale,
  loan,
  standing,
  funds,
  onClose,
  onDone,
}: {
  locale: Locale;
  loan: LoanCardDto;
  standing: StandingDto | null;
  funds: FundOption[];
  onClose: () => void;
  onDone: () => void;
}) {
  const tr = translator(locale);
  const label = loanLabel(locale, loan.number);
  const balance = standing?.balancePaisa ?? 0;
  const [mode, setMode] = useState<Mode>("CASH");
  const [amount, setAmount] = useState(paisaToInput(Math.min(loan.installmentPaisa ?? loan.outstandingPaisa, loan.outstandingPaisa)));
  const [date, setDate] = useState(todayIsoInDhaka());
  const [fundId, setFundId] = useState(funds[0]?.id ?? "");
  const [method, setMethod] = useState<Method>("CASH");
  const [ref, setRef] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(newIdempotencyKey);
  const save = useApiMutation(["loans", "repay", loan.id], (body: Record<string, unknown>) =>
    apiFetch<{ loan: { status: string; outstandingPaisa: number } }>(`/loans/${loan.id}/repayments`, { method: "POST", body, headers: { "Idempotency-Key": key } }),
  );
  const max = repaymentCap(mode, loan.outstandingPaisa, balance);

  function validate(paisa: number | null): Record<string, string> {
    const e: Record<string, string> = {};
    if (!paisa) e.amountPaisa = tr("al.err.amount");
    else if (paisa > loan.outstandingPaisa) e.amountPaisa = tr("al.err.overOutstanding", { amount: formatMoney(locale, loan.outstandingPaisa), loan: label });
    else if (paisa > max) e.amountPaisa = tr("al.err.overBalance", { name: loan.ownerName, amount: formatMoney(locale, Math.max(0, balance)) });
    if (!date || isAfterTomorrow(date, todayIsoInDhaka())) e.date = tr("pay.err.date");
    if (mode === "CASH" && !fundId) e.fundAccountId = tr("pay.err.fund");
    if (mode === "CASH" && method !== "CASH" && !ref.trim()) e.referenceNo = tr("pay.err.ref");
    return e;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (save.isPending) return;
    const paisa = parseAmount(amount);
    const e = validate(paisa);
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    setError(null);
    const res = await save.run({ mode, amountPaisa: paisa, date, ...(mode === "CASH" ? { fundAccountId: fundId, method, referenceNo: ref.trim() || null } : {}) });
    if (!res.ok) {
      const fields = res.error.details?.fields ?? {};
      setErrors(fields);
      return setError(Object.keys(fields).length ? null : res.status === 0 ? tr("common.network") : res.error.message);
    }
    toast(res.data.loan.status === "REPAID" ? tr("al.repay.repaid", { loan: label }) : tr("al.repay.toast", { amount: formatMoney(locale, res.data.loan.outstandingPaisa), loan: label }));
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]" lang={locale}>
        <DialogHeader>
          <DialogTitle>{tr("al.repay.title", { loan: label })}</DialogTitle>
          <DialogDescription>{tr("al.repay.sub", { name: loan.ownerName, amount: formatMoney(locale, loan.outstandingPaisa) })}</DialogDescription>
        </DialogHeader>
        <form id="repay-form" className="form-stack" onSubmit={onSubmit} noValidate>
          <ErrorStrip message={error} />
          <Choice
            id="repay-mode"
            label={tr("al.repay.mode")}
            value={mode}
            onChange={(m) => {
              setMode(m);
              setErrors({});
            }}
            options={(["CASH", "DEDUCTION"] as Mode[]).map((m) => ({ value: m, label: tr(`al.repay.${m}` as MessageKey) }))}
          />
          <p className="muted m-0">{tr(mode === "CASH" ? "al.repay.cashHelp" : "al.repay.dedHelp")}</p>
          {mode === "DEDUCTION" ? (
            <p className="m-0 font-semibold">{tr("al.repay.dedCap", { name: loan.ownerName, balance: formatMoney(locale, balance), max: formatMoney(locale, max) })}</p>
          ) : null}
          <TextField
            id="repay-amount"
            label={tr("pay.amount")}
            inputMode="decimal"
            required
            className="amount-input"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setErrors((x) => ({ ...x, amountPaisa: "" }));
            }}
            error={errors.amountPaisa}
          />
          <Button
            type="button"
            variant="ghost"
            className="self-start pl-0"
            onClick={() => {
              setAmount(paisaToInput(loan.outstandingPaisa));
              setErrors((x) => ({ ...x, amountPaisa: "" }));
            }}
          >
            {tr("al.repay.useFull")}
          </Button>
          <DateField
            id="repay-date"
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
          {mode === "CASH" ? (
            <>
              <SelectField
                id="repay-fund"
                label={tr("al.repay.fund")}
                required
                value={fundId}
                onChange={(e) => setFundId(e.target.value)}
                error={errors.fundAccountId}
                options={[{ value: "", label: tr("pay.choose") }, ...funds.map((f) => ({ value: f.id, label: tr("pay.fundOption", { name: f.name, balance: formatMoney(locale, f.balancePaisa) }) }))]}
              />
              <Choice id="repay-method" label={tr("pay.method")} value={method} onChange={setMethod} options={METHODS.map((m) => ({ value: m, label: tr(`method.${m}` as MessageKey) }))} />
              <TextField id="repay-ref" label={tr("pay.ref")} placeholder={tr("pay.refPh")} required={method !== "CASH"} maxLength={60} value={ref} onChange={(e) => setRef(e.target.value)} error={errors.referenceNo} />
            </>
          ) : null}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            {tr("common.cancel")}
          </Button>
          <Button type="submit" form="repay-form" disabled={save.isPending}>
            {tr("al.recordRepayment")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
