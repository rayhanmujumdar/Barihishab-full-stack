"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowRightIcon, ExclamationTriangleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { AttachmentPicker } from "@/components/entries/AttachmentPicker";
import { newIdempotencyKey } from "@/components/entries/upload";
import { ErrorStrip } from "@/components/forms/error-strip";
import { DateField, RequiredLegend, requiredProps, SelectField, TextField } from "@/components/forms/fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetClose, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiFetch } from "@/lib/api/client";
import { qk, useApiMutation } from "@/lib/api/query";
import { todayIsoInDhaka } from "@/lib/clock";
import { translator, type Locale, type MessageKey } from "@/lib/i18n";
import { formatMoney, paisaToInput, parseAmount } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import { isAfterTomorrow } from "@/lib/transactions/rules";
import { cn } from "@/lib/utils";
import { Choice } from "./Choice";
import { balanceText, balanceTone } from "./format";
import type { OwnerPageData } from "./types";

type Method = "CASH" | "BANK" | "BKASH" | "NAGAD";
type Warning = { code: "FUND_SHORT" | "HOUSE_FUND_SHORT" | "ADVANCE_OVER_LIMIT"; fundAccountId?: string; balancePaisa?: number };
type Excess = { payoutPaisa: number; excessPaisa: number };
type PayoutData = { entries: unknown[]; loan: { principalPaisa: number } | null; warnings: Warning[] };
const METHODS: Method[] = ["CASH", "BANK", "BKASH", "NAGAD"];

/** Pay an owner (F11) or record an advance (F12) — the shared entry drawer. */
export function PayDrawer({ locale, mode, data, onClose, onSaved }: { locale: Locale; mode: "pay" | "advance"; data: OwnerPageData; onClose: () => void; onSaved: () => void }) {
  const tr = translator(locale);
  const { owner } = data;
  const owed = Math.max(owner.balancePaisa, 0);
  const funds = data.funds.filter((f) => f.isActive);
  const [amount, setAmount] = useState(mode === "pay" && owed > 0 ? paisaToInput(owed) : "");
  const [date, setDate] = useState(todayIsoInDhaka());
  const [fundId, setFundId] = useState(funds[0]?.id ?? "");
  const [method, setMethod] = useState<Method>("CASH");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [uploads, setUploads] = useState<{ ids: string[]; busy: boolean }>({ ids: [], busy: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [excess, setExcess] = useState<Excess | null>(null);
  // One key per open drawer: a double tap or retry never pays twice (DUP-01).
  const [key] = useState(newIdempotencyKey);
  const createPayout = useApiMutation(["owners", "payout"], (body: Record<string, unknown>) => apiFetch<PayoutData>("/payouts", { method: "POST", body, headers: { "Idempotency-Key": key } }), { invalidate: [qk.owners.all] });
  const createAdvance = useApiMutation(["owners", "advance"], (body: Record<string, unknown>) => apiFetch<{ warnings: Warning[] }>("/advances", { method: "POST", body, headers: { "Idempotency-Key": key } }), { invalidate: [qk.owners.all] });
  const amountRef = useRef<HTMLInputElement>(null);

  const paisa = parseAmount(amount);
  const bal = balanceText(locale, owner.balanceLabel, owner.balancePaisa);
  const clear = (k: string) => setErrors((e) => ({ ...e, [k]: "" }));

  // Soft warnings (PAY-04): shown, never blocking.
  const warnings = useMemo(() => {
    const out: string[] = [];
    const fund = funds.find((f) => f.id === fundId);
    if (fund && paisa && fund.balancePaisa - paisa < 0) out.push(tr("pay.warn.fund", { fund: fund.name, balance: formatMoney(locale, fund.balancePaisa - paisa) }));
    if (paisa && paisa > data.houseFundPaisa) out.push(tr("pay.warn.house", { amount: formatMoney(locale, data.houseFundPaisa) }));
    return out;
  }, [funds, fundId, paisa, data.houseFundPaisa, locale, tr]);

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!paisa) e.amountPaisa = tr("pay.err.amount");
    if (!fundId) e.fundAccountId = tr("pay.err.fund");
    if (!date || isAfterTomorrow(date, todayIsoInDhaka())) e.date = tr("pay.err.date");
    if (method !== "CASH" && !ref.trim()) e.referenceNo = tr("pay.err.ref");
    if (mode === "advance" && !reason.trim()) e.reason = tr("pay.err.reason");
    return e;
  }

  async function send(splitExcessAs?: "ADVANCE" | "LOAN") {
    setPending(true);
    setError(null);
    const common = {
      ownerId: owner.id,
      amountPaisa: paisa,
      date,
      fundAccountId: fundId,
      method,
      referenceNo: ref.trim() || null,
      ...(uploads.ids.length ? { attachmentIds: uploads.ids } : {}),
    };
    const res =
      mode === "pay"
        ? await createPayout.run({ ...common, note: note.trim() || null, ...(splitExcessAs ? { splitExcessAs } : {}) })
        : await createAdvance.run({ ...common, reason: reason.trim() });
    setPending(false);
    if (!res.ok) {
      if (res.error.code === "EXCEEDS_BALANCE" && res.error.details) {
        setExcess({ payoutPaisa: Number(res.error.details.payoutPaisa), excessPaisa: Number(res.error.details.excessPaisa) });
        return;
      }
      setExcess(null);
      setError(res.status === 0 ? tr("common.network") : res.error.message);
      return;
    }
    setExcess(null);
    const vars = { amount: formatMoney(locale, paisa!), name: owner.displayName };
    const payout = mode === "pay" ? (res.data as PayoutData) : null;
    // A split with nothing owed writes only a loan: don't announce a payment that didn't happen.
    if (!payout || payout.entries.length) toast(tr(mode === "pay" ? "pay.toast" : "adv.toast", vars));
    if (payout?.loan) toast(tr("pay.loanToast", { amount: formatMoney(locale, payout.loan.principalPaisa), name: owner.displayName }));
    for (const w of res.data.warnings) toast.warning(warningText(w));
    onSaved();
  }

  function warningText(w: Warning): string {
    if (w.code === "ADVANCE_OVER_LIMIT") return tr("pay.warn.limit");
    if (w.code === "HOUSE_FUND_SHORT") return tr("pay.warn.house", { amount: formatMoney(locale, w.balancePaisa ?? 0) });
    const fund = funds.find((f) => f.id === w.fundAccountId);
    return tr("pay.warn.fund", { fund: fund?.name ?? "", balance: formatMoney(locale, w.balancePaisa ?? 0) });
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (pending || uploads.busy) return;
    const e = validate();
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    await send();
  }

  const title = tr(mode === "pay" ? "pay.title" : "adv.title", { name: owner.displayName });
  const amountError = errors.amountPaisa;

  return (
    <Sheet open onOpenChange={(o) => !o && !pending && onClose()}>
      <SheetContent side="right" showCloseButton={false} aria-describedby={undefined} className="w-full gap-0 border-l-2 border-foreground bg-background p-0 sm:max-w-[540px]">
        <SheetHeader className="flex-row items-center justify-between gap-3 border-b-2 border-foreground px-5 py-4">
          <SheetTitle className="text-[22px] font-extrabold tracking-[-0.015em]">{title}</SheetTitle>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label={tr("common.close")}>
              <XMarkIcon />
            </Button>
          </SheetClose>
        </SheetHeader>
        <form id="pay-form" className="form-stack flex-1 overflow-y-auto p-5" onSubmit={onSubmit} noValidate lang={locale}>
          <ErrorStrip message={error} />
          <div className="flex flex-col gap-1 border-t-2 border-foreground bg-[var(--color-surface)] p-3">
            <p className="m-0 font-extrabold">
              {tr("pay.panel", { name: owner.displayName, amount: formatMoney(locale, owner.balancePaisa) })}{" "}
              <span className={cn("bal-tag", `bal-${balanceTone(owner.balancePaisa)}`)}>{bal.word}</span>
            </p>
            {owner.oldestDueMonth ? <p className="muted m-0">{tr("pay.against", { month: monthLabel(locale, owner.oldestDueMonth) })}</p> : null}
            {mode === "pay" && owed > 0 ? (
              <Button
                type="button"
                variant="ghost"
                className="self-start pl-0"
                onClick={() => {
                  setAmount(paisaToInput(owed));
                  clear("amountPaisa");
                }}
              >
                {tr("pay.useFull", { amount: formatMoney(locale, owed) })}
              </Button>
            ) : null}
          </div>
          {mode === "pay" && owed === 0 ? (
            <Alert variant="destructive">
              <ExclamationTriangleIcon className="size-4" />
              <AlertDescription>{tr("pay.nothing")}</AlertDescription>
            </Alert>
          ) : null}
          {warnings.length ? (
            <Alert variant="destructive">
              <ExclamationTriangleIcon className="size-4" />
              <AlertDescription>
                {warnings.map((w) => (
                  <span key={w} className="block">
                    {w}
                  </span>
                ))}
              </AlertDescription>
            </Alert>
          ) : null}
          <RequiredLegend text={tr("common.required")} />
          <Field>
            <FieldLabel htmlFor="pay-amount" className="text-xs font-semibold text-muted-foreground" {...requiredProps(true)}>
              {tr("pay.amount")}
            </FieldLabel>
            <Input
              ref={amountRef}
              id="pay-amount"
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
              aria-invalid={amountError ? true : undefined}
              aria-describedby={amountError ? "pay-amount-error" : undefined}
            />
            {amountError ? (
              <FieldError id="pay-amount-error" className="text-xs font-semibold">
                {amountError}
              </FieldError>
            ) : null}
          </Field>
          <div className="grid-2">
            <DateField
              id="pay-date"
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
              id="pay-fund"
              label={tr("pay.fund")}
              required
              value={fundId}
              onChange={(e) => {
                setFundId(e.target.value);
                clear("fundAccountId");
              }}
              error={errors.fundAccountId}
              options={[{ value: "", label: tr("pay.choose") }, ...funds.map((f) => ({ value: f.id, label: tr("pay.fundOption", { name: f.name, balance: formatMoney(locale, f.balancePaisa) }) }))]}
            />
          </div>
          <Choice id="pay-method" label={tr("pay.method")} value={method} onChange={setMethod} options={METHODS.map((m) => ({ value: m, label: tr(`method.${m}` as MessageKey) }))} />
          <TextField
            id="pay-ref"
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
          {mode === "pay" ? (
            <TextField id="pay-note" label={tr("pay.note")} placeholder={tr("pay.notePh")} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          ) : (
            <TextField
              id="pay-reason"
              label={tr("pay.reason")}
              placeholder={tr("pay.reasonPh")}
              required
              maxLength={300}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                clear("reason");
              }}
              error={errors.reason}
            />
          )}
          <AttachmentPicker locale={locale} onChange={(ids, busy) => setUploads({ ids, busy })} />
        </form>
        <SheetFooter className="flex-row justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {tr("common.cancel")}
          </Button>
          <Button type="submit" form="pay-form" disabled={pending || uploads.busy}>
            {tr(mode === "pay" ? "pay.save" : "adv.save")}
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </SheetFooter>
      </SheetContent>

      <AlertDialog open={!!excess} onOpenChange={(o) => !o && !pending && setExcess(null)}>
        <AlertDialogContent className="rounded-none sm:max-w-[520px]" lang={locale}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-extrabold">{tr("excess.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {excess ? tr("excess.body", { amount: formatMoney(locale, excess.excessPaisa), name: owner.displayName }) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {excess ? (
            <dl className="kv">
              <dt>{tr("excess.payout")}</dt>
              <dd className="font-extrabold">{formatMoney(locale, excess.payoutPaisa)}</dd>
              <dt>{tr("excess.excess")}</dt>
              <dd className="font-extrabold">{formatMoney(locale, excess.excessPaisa)}</dd>
            </dl>
          ) : null}
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <Button disabled={pending} onClick={() => send("ADVANCE")} className="justify-between">
              {tr("excess.advance")}
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => send("LOAN")} className="justify-between">
              {tr("excess.loan")}
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
            <AlertDialogCancel disabled={pending} onClick={() => setTimeout(() => amountRef.current?.focus(), 0)}>
              {tr("excess.change")}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
