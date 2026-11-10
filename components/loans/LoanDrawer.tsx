"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ArrowRightIcon, ExclamationTriangleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { newIdempotencyKey } from "@/components/entries/upload";
import { ErrorStrip } from "@/components/forms/error-strip";
import { DateField, RequiredLegend, SelectField, TextField } from "@/components/forms/fields";
import { Choice } from "@/components/owners/Choice";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { expectedFinish } from "@/lib/accounting/loans";
import { apiFetch } from "@/lib/api/client";
import { useApiMutation } from "@/lib/api/query";
import { todayIsoInDhaka } from "@/lib/clock";
import { translator, type Locale, type MessageKey } from "@/lib/i18n";
import { formatMoney, parseAmount } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import { isAfterTomorrow } from "@/lib/transactions/rules";
import { AdvanceLimitPanel } from "./AdvanceLimitPanel";
import { loanLabel } from "./format";
import type { FundOption, StandingDto } from "./types";

type Method = "CASH" | "BANK" | "BKASH" | "NAGAD";
const METHODS: Method[] = ["CASH", "BANK", "BKASH", "NAGAD"];

export type LoanDrawerData = { standing: StandingDto[]; funds: FundOption[]; houseFundPaisa: number; openMonth: string | null };

/** New loan (F4) or advance (F12) — the shared entry drawer with live hints that never block. */
export function LoanDrawer({ locale, mode, data, onClose, onSaved }: { locale: Locale; mode: "loan" | "advance"; data: LoanDrawerData; onClose: () => void; onSaved: () => void }) {
  const tr = translator(locale);
  const [ownerId, setOwnerId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIsoInDhaka());
  const [fundId, setFundId] = useState(data.funds[0]?.id ?? "");
  const [method, setMethod] = useState<Method>("CASH");
  const [ref, setRef] = useState("");
  const [instalment, setInstalment] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(newIdempotencyKey);
  const save = useApiMutation(["loans", mode], (body: Record<string, unknown>) =>
    apiFetch<{ loan?: { number: number } }>(mode === "loan" ? "/loans" : "/advances", { method: "POST", body, headers: { "Idempotency-Key": key } }),
  );

  const owner = data.standing.find((o) => o.ownerId === ownerId) ?? null;
  const paisa = parseAmount(amount);
  const instPaisa = instalment.trim() ? parseAmount(instalment) : null;
  const clear = (k: string) => setErrors((e) => ({ ...e, [k]: "" }));

  const hints = useMemo(() => {
    const out: string[] = [];
    if (mode === "loan" && owner?.latestActiveLoan) {
      out.push(tr("al.hint.hasLoan", { name: owner.displayName, loan: loanLabel(locale, owner.latestActiveLoan.number), amount: formatMoney(locale, owner.latestActiveLoan.outstandingPaisa) }));
    }
    if (mode === "loan" && owner && instPaisa && owner.averageEntitlementPaisa !== null && instPaisa > owner.averageEntitlementPaisa) {
      out.push(tr("al.hint.aboveShare", { name: owner.displayName, amount: formatMoney(locale, owner.averageEntitlementPaisa) }));
    }
    const fund = data.funds.find((f) => f.id === fundId);
    if (fund && paisa && fund.balancePaisa - paisa < 0) out.push(tr("pay.warn.fund", { fund: fund.name, balance: formatMoney(locale, fund.balancePaisa - paisa) }));
    if (paisa && paisa > data.houseFundPaisa) out.push(tr("pay.warn.house", { amount: formatMoney(locale, data.houseFundPaisa) }));
    return out;
  }, [mode, owner, instPaisa, paisa, fundId, data.funds, data.houseFundPaisa, locale, tr]);

  const payoff =
    mode === "loan" && paisa && instPaisa && instPaisa <= paisa
      ? expectedFinish({ status: "ACTIVE", outstandingPaisa: paisa, installmentPaisa: instPaisa, disbursedOn: date || todayIsoInDhaka(), earliestOpenMonth: data.openMonth })
      : null;

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!ownerId) e.ownerId = tr("al.err.owner");
    if (!paisa) e.amountPaisa = tr("al.err.amount");
    if (!fundId) e.fundAccountId = tr("pay.err.fund");
    if (!date || isAfterTomorrow(date, todayIsoInDhaka())) e.date = tr("pay.err.date");
    if (method !== "CASH" && !ref.trim()) e.referenceNo = tr("pay.err.ref");
    if (!reason.trim()) e.reason = tr("al.err.reason");
    if (mode === "loan" && instalment.trim() && (instPaisa === null || (paisa && instPaisa > paisa))) e.installmentPaisa = tr("al.err.instalment");
    return e;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (save.isPending) return;
    const e = validate();
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    setError(null);
    const body = {
      ownerId,
      amountPaisa: paisa,
      date,
      fundAccountId: fundId,
      method,
      referenceNo: ref.trim() || null,
      reason: reason.trim(),
      ...(mode === "loan" && instPaisa ? { installmentPaisa: instPaisa } : {}),
    };
    const res = await save.run(body);
    if (!res.ok) {
      setErrors(res.error.details?.fields ?? {});
      return setError(res.status === 0 ? tr("common.network") : res.error.message);
    }
    const vars = { amount: formatMoney(locale, paisa!), name: owner?.displayName ?? "" };
    toast(mode === "loan" ? tr("al.toast.loan", { ...vars, loan: loanLabel(locale, res.data.loan?.number ?? 0) }) : tr("adv.toast", vars));
    onSaved();
  }

  return (
    <Sheet open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <SheetContent side="right" showCloseButton={false} aria-describedby={undefined} className="w-full gap-0 border-l-2 border-foreground bg-background p-0 sm:max-w-[540px]">
        <SheetHeader className="flex-row items-center justify-between gap-3 border-b-2 border-foreground px-5 py-4">
          <SheetTitle className="text-[22px] font-extrabold tracking-[-0.015em]">{tr(mode === "loan" ? "al.form.loanTitle" : "al.form.advanceTitle")}</SheetTitle>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label={tr("common.close")}>
              <XMarkIcon />
            </Button>
          </SheetClose>
        </SheetHeader>
        <form id="loan-form" className="form-stack flex-1 overflow-y-auto p-5" onSubmit={onSubmit} noValidate lang={locale}>
          <ErrorStrip message={error} />
          <RequiredLegend text={tr("common.required")} />
          <SelectField
            id="loan-owner"
            label={tr("al.form.owner")}
            required
            value={ownerId}
            onChange={(e) => {
              setOwnerId(e.target.value);
              clear("ownerId");
            }}
            error={errors.ownerId}
            options={[{ value: "", label: tr("al.form.choose") }, ...data.standing.map((o) => ({ value: o.ownerId, label: o.displayName }))]}
          />
          {mode === "advance" && owner ? <AdvanceLimitPanel locale={locale} owner={owner} amountPaisa={paisa} /> : null}
          <TextField
            id="loan-amount"
            label={tr("pay.amount")}
            inputMode="decimal"
            autoComplete="off"
            required
            className="amount-input"
            placeholder={tr("pay.amountPh")}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              clear("amountPaisa");
            }}
            error={errors.amountPaisa}
          />
          <div className="grid-2">
            <DateField
              id="loan-date"
              label={tr("pay.date")}
              required
              requiredText={tr("common.required")}
              placeholder={tr("pay.datePh")}
              clearLabel={tr("common.clear")}
              locale={locale}
              disableFuture
              fromYear={2020}
              value={date}
              onChange={(v) => {
                setDate(v);
                clear("date");
              }}
              error={errors.date}
            />
            <SelectField
              id="loan-fund"
              label={tr("pay.fund")}
              required
              value={fundId}
              onChange={(e) => {
                setFundId(e.target.value);
                clear("fundAccountId");
              }}
              error={errors.fundAccountId}
              options={[{ value: "", label: tr("pay.choose") }, ...data.funds.map((f) => ({ value: f.id, label: tr("pay.fundOption", { name: f.name, balance: formatMoney(locale, f.balancePaisa) }) }))]}
            />
          </div>
          <Choice id="loan-method" label={tr("pay.method")} value={method} onChange={setMethod} options={METHODS.map((m) => ({ value: m, label: tr(`method.${m}` as MessageKey) }))} />
          <TextField
            id="loan-ref"
            label={tr("pay.ref")}
            placeholder={tr("pay.refPh")}
            required={method !== "CASH"}
            maxLength={60}
            value={ref}
            onChange={(e) => {
              setRef(e.target.value);
              clear("referenceNo");
            }}
            error={errors.referenceNo}
          />
          {mode === "loan" ? (
            <TextField
              id="loan-instalment"
              label={tr("al.form.instalment")}
              inputMode="decimal"
              value={instalment}
              onChange={(e) => {
                setInstalment(e.target.value);
                clear("installmentPaisa");
              }}
              error={errors.installmentPaisa}
              hint={payoff ? tr("al.hint.payoff", { n: payoff.monthsLeft, month: monthLabel(locale, payoff.finishMonth) }) : undefined}
            />
          ) : null}
          <TextField
            id="loan-reason"
            label={tr("al.form.reason")}
            placeholder={tr("al.form.reasonPh")}
            required
            maxLength={300}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              clear("reason");
            }}
            error={errors.reason}
          />
          {hints.length ? (
            <Alert variant="destructive">
              <ExclamationTriangleIcon className="size-4" />
              <AlertDescription>
                {hints.map((h) => (
                  <span key={h} className="block">
                    {h}
                  </span>
                ))}
              </AlertDescription>
            </Alert>
          ) : null}
        </form>
        <SheetFooter className="flex-row justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            {tr("common.cancel")}
          </Button>
          <Button type="submit" form="loan-form" disabled={save.isPending}>
            {tr(mode === "loan" ? "al.form.saveLoan" : "adv.save")}
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
