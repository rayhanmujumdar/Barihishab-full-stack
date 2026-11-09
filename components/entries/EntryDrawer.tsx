"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRightIcon, ExclamationTriangleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { ErrorStrip } from "@/components/forms/error-strip";
import { DateField, SelectField, TextField } from "@/components/forms/fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetClose, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiFetch, fieldErrors, type ApiResult } from "@/lib/api/client";
import { todayIsoInDhaka } from "@/lib/clock";
import { translator, type Locale, type MessageKey } from "@/lib/i18n";
import { formatMoney, paisaToInput, parseAmount } from "@/lib/money";
import { daysFromPeriod, monthLabel } from "@/lib/periods/month";
import { isAfterTomorrow } from "@/lib/transactions/rules";
import { AttachmentPicker } from "./AttachmentPicker";
import { newIdempotencyKey } from "./upload";
import { categoryName } from "./format";
import type { EntriesData, Kind, TxnDto } from "./types";

type Mode = { kind: Kind; entry?: undefined } | { entry: TxnDto; kind?: undefined };
type Warning = { code: string; fundAccountId?: string; balancePaisa?: number };
type WriteResult = { transaction: TxnDto; warnings: Warning[] };

const HIDDEN_CODES = ["OWNER_GRANT", "ADJUSTMENT_INC", "ADJUSTMENT_EXP"];
const LAST_CATEGORY = "bh.lastCategory.EXPENSE";
const LAST_FUND = "bh.lastFund";

const FIELD_MESSAGE: Record<string, MessageKey> = {
  amountPaisa: "entry.err.amount",
  categoryId: "entry.err.category",
  fundAccountId: "entry.err.fund",
  unitId: "entry.err.unit",
  referencePeriod: "entry.err.reference",
  reason: "entry.err.reason",
  txnDate: "entry.err.date",
  period: "entry.err.period",
  attachmentIds: "entry.files.bad",
};

const remembered = (key: string) => (typeof window === "undefined" ? null : window.localStorage.getItem(key));

type Form = {
  kind: Kind;
  period: string;
  categoryId: string;
  referencePeriod: string;
  amount: string;
  txnDate: string;
  fundAccountId: string;
  unitId: string;
  vendor: string;
  description: string;
  fromReserve: boolean;
  reason: string;
};

function initialForm(data: EntriesData, mode: Mode): Form {
  if (mode.entry) {
    const e = mode.entry;
    return {
      kind: e.kind,
      period: e.period,
      categoryId: e.categoryId,
      referencePeriod: e.referencePeriod ?? "",
      amount: paisaToInput(e.amountPaisa),
      txnDate: e.txnDate,
      fundAccountId: e.fundAccountId,
      unitId: e.unitId ?? "",
      vendor: e.vendor ?? "",
      description: e.description ?? "",
      fromReserve: e.fromReserve,
      reason: "",
    };
  }
  const kind = mode.kind;
  const active = data.categories.filter((c) => c.kind === kind && c.isActive && !HIDDEN_CODES.includes(c.code));
  const lastCat = kind === "EXPENSE" ? remembered(LAST_CATEGORY) : null;
  const category =
    active.find((c) => c.id === lastCat) ?? active.find((c) => c.code === (kind === "INCOME" ? "RENT" : "ELEC")) ?? active[0];
  const funds = data.funds.filter((f) => f.isActive);
  const lastFund = remembered(LAST_FUND);
  const period = data.status === "OPEN" ? data.month : (data.latestOpen ?? data.month);
  return {
    kind,
    period,
    categoryId: category?.id ?? "",
    referencePeriod: "",
    amount: "",
    txnDate: todayIsoInDhaka(),
    fundAccountId: (funds.find((f) => f.id === lastFund) ?? funds[0])?.id ?? "",
    unitId: "",
    vendor: "",
    description: "",
    fromReserve: false,
    reason: "",
  };
}

/** S4 — entry drawer for creating and correcting income/expenses (PRD §6.2). */
export function EntryDrawer({ locale, data, mode, onClose, onSaved }: { locale: Locale; data: EntriesData; mode: Mode; onClose: () => void; onSaved: () => void }) {
  const tr = translator(locale);
  const correcting = !!mode.entry;
  const [form, setForm] = useState<Form>(() => initialForm(data, mode));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [uploads, setUploads] = useState<{ ids: string[]; busy: boolean }>({ ids: [], busy: false });
  const [vendors, setVendors] = useState<string[]>([]);
  const [fundTouched, setFundTouched] = useState(correcting);
  // One key per open drawer: a double tap or retry never creates two entries (DUP-01).
  const [idempotencyKey] = useState(newIdempotencyKey);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k === "amount" ? "amountPaisa" : k]: "" }));
  };

  const category = data.categories.find((c) => c.id === form.categoryId);
  const code = category?.code;
  const isRentLike = code === "RENT" || code === "ARREAR";
  // Arrear rent and Adjustments (LCK-02) always point at a closed month.
  const needsReference = code === "ARREAR" || mode.entry?.source === "ADJUSTMENT";
  const openMonths = data.periods.filter((p) => p.status === "OPEN");
  const closedBefore = data.periods.filter((p) => p.status === "CLOSED" && p.month < form.period);
  const categoryOptions = data.categories.filter(
    (c) => c.kind === form.kind && ((c.isActive && !HIDDEN_CODES.includes(c.code)) || c.id === mode.entry?.categoryId),
  );
  const funds = data.funds.filter((f) => f.isActive || f.id === mode.entry?.fundAccountId);
  const units = data.units.filter((u) => u.isActive || u.id === mode.entry?.unitId);
  const amountPaisa = parseAmount(form.amount);

  // Vendor autocomplete (EXP-03), debounced.
  useEffect(() => {
    if (form.kind !== "EXPENSE") return;
    const t = setTimeout(async () => {
      const res = await apiFetch<{ items: string[] }>(`/transactions/vendors?q=${encodeURIComponent(form.vendor.trim())}`);
      if (res.ok) setVendors(res.data.items);
    }, 250);
    return () => clearTimeout(t);
  }, [form.kind, form.vendor]);

  // Live soft warnings (FND-01, G5): shown, never blocking.
  const liveWarnings = useMemo(() => {
    const out: string[] = [];
    const fund = data.funds.find((f) => f.id === form.fundAccountId);
    if (fund && amountPaisa) {
      const sign = form.kind === "INCOME" ? 1 : -1;
      const old = mode.entry && mode.entry.fundAccountId === fund.id && !mode.entry.voidedAt ? (mode.entry.kind === "INCOME" ? 1 : -1) * mode.entry.amountPaisa : 0;
      const projected = fund.balancePaisa - old + sign * amountPaisa;
      if (projected < 0) out.push(tr("warn.FUND_NEGATIVE", { fund: fund.name, balance: formatMoney(locale, projected) }));
    }
    if (form.txnDate && daysFromPeriod(form.txnDate, form.period) > 45) out.push(tr("warn.DATE_FAR_FROM_PERIOD"));
    return out;
  }, [data.funds, form.fundAccountId, form.kind, form.txnDate, form.period, amountPaisa, mode.entry, locale, tr]);

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!amountPaisa) e.amountPaisa = tr("entry.err.amount");
    if (!form.categoryId) e.categoryId = tr("entry.err.category");
    if (!form.fundAccountId) e.fundAccountId = tr("entry.err.fund");
    if (!form.period) e.period = tr("entry.err.period");
    if (form.kind === "INCOME" && isRentLike && !form.unitId) e.unitId = tr("entry.err.unit");
    if (needsReference && !form.referencePeriod) e.referencePeriod = tr("entry.err.reference");
    if (!form.txnDate || isAfterTomorrow(form.txnDate, todayIsoInDhaka())) e.txnDate = tr("entry.err.date");
    if (correcting && form.reason.trim().length < 5) e.reason = tr("entry.err.reason");
    return e;
  }

  function body(): Record<string, unknown> {
    const b: Record<string, unknown> = {
      period: form.period,
      categoryId: form.categoryId,
      amountPaisa,
      txnDate: form.txnDate,
      fundAccountId: form.fundAccountId,
      unitId: form.kind === "INCOME" && form.unitId ? form.unitId : null,
      vendor: form.kind === "EXPENSE" ? form.vendor.trim() || null : null,
      description: form.description.trim() || null,
      fromReserve: form.kind === "EXPENSE" ? form.fromReserve : false,
      referencePeriod: needsReference ? form.referencePeriod : null,
    };
    if (!mode.entry) return { ...b, kind: form.kind, ...(uploads.ids.length ? { attachmentIds: uploads.ids } : {}) };
    const e = mode.entry;
    const before: Record<string, unknown> = {
      period: e.period,
      categoryId: e.categoryId,
      amountPaisa: e.amountPaisa,
      txnDate: e.txnDate,
      fundAccountId: e.fundAccountId,
      unitId: e.unitId,
      vendor: e.vendor,
      description: e.description,
      fromReserve: e.fromReserve,
      referencePeriod: e.referencePeriod,
    };
    const changed = Object.fromEntries(Object.entries(b).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(before[k])));
    return { ...changed, reason: form.reason.trim() };
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (pending || uploads.busy) return;
    const local = validate();
    setErrors(local);
    if (Object.keys(local).length) return;
    setPending(true);
    setError(null);
    const res: ApiResult<WriteResult> = mode.entry
      ? await apiFetch<WriteResult>(`/transactions/${mode.entry.id}`, { method: "PATCH", body: body() })
      : await apiFetch<WriteResult>("/transactions", { method: "POST", body: body(), headers: { "Idempotency-Key": idempotencyKey } });
    setPending(false);
    if (!res.ok) {
      const fields = fieldErrors(res);
      if (Object.keys(fields).length) {
        if (fields._) setError(tr("entry.err.nothing"));
        setErrors(Object.fromEntries(Object.keys(fields).map((k) => [k, tr(FIELD_MESSAGE[k] ?? "entry.err.field")])));
      } else setError(res.status === 0 ? `${tr("common.network")} ${tr("entry.retry")}` : res.error.message);
      return;
    }
    if (!mode.entry) {
      if (form.kind === "EXPENSE") window.localStorage.setItem(LAST_CATEGORY, form.categoryId);
      window.localStorage.setItem(LAST_FUND, form.fundAccountId);
    }
    const amount = formatMoney(locale, res.data.transaction.amountPaisa);
    toast(
      mode.entry
        ? tr("entry.toast.corrected")
        : tr(form.kind === "INCOME" ? "entry.toast.income" : "entry.toast.expense", { amount, month: monthLabel(locale, res.data.transaction.period) }),
    );
    if (res.data.warnings.length) {
      toast.warning(res.data.warnings.map((w) => warningText(w)).join(" "));
    }
    onSaved();
  }

  function warningText(w: Warning): string {
    if (w.code === "FUND_NEGATIVE") {
      const fund = data.funds.find((f) => f.id === w.fundAccountId);
      return tr("warn.FUND_NEGATIVE", { fund: fund?.name ?? "", balance: formatMoney(locale, w.balancePaisa ?? 0) });
    }
    return tr(`warn.${w.code}` as MessageKey);
  }

  function pickUnit(id: string) {
    set("unitId", id);
    const unit = data.units.find((u) => u.id === id);
    if (unit?.defaultFundAccountId && !fundTouched) set("fundAccountId", unit.defaultFundAccountId);
  }

  const title = correcting ? tr("entry.correct") : tr(form.kind === "INCOME" ? "entry.new.income" : "entry.new.expense");
  const saveLabel = correcting ? tr("entry.save.correction") : tr(form.kind === "INCOME" ? "entry.save.income" : "entry.save.expense");
  const formId = "entry-form";
  const amountError = errors.amountPaisa;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} aria-describedby={undefined} className="w-full gap-0 border-l-2 border-foreground bg-background p-0 sm:max-w-[540px]">
        <SheetHeader className="flex-row items-center justify-between gap-3 border-b-2 border-foreground px-5 py-4">
          <SheetTitle className="text-[22px] font-extrabold tracking-[-0.015em]">{title}</SheetTitle>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label={tr("common.close")}>
              <XMarkIcon />
            </Button>
          </SheetClose>
        </SheetHeader>
        <form id={formId} className="form-stack flex-1 overflow-y-auto p-5" onSubmit={onSubmit} noValidate lang={locale}>
          <ErrorStrip message={error} />
          {liveWarnings.length ? (
            <Alert variant="destructive" data-testid="entry-warnings">
              <ExclamationTriangleIcon className="size-4" />
              <AlertDescription>{liveWarnings.join(" ")}</AlertDescription>
            </Alert>
          ) : null}

          {!correcting ? (
            <div role="group" aria-label={tr("entry.type")} className="grid grid-cols-2 border border-border">
              {(["INCOME", "EXPENSE"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={form.kind === k}
                  className="min-h-11 font-extrabold aria-pressed:bg-foreground aria-pressed:text-background"
                  onClick={() => k !== form.kind && setForm(initialForm(data, { kind: k }))}
                >
                  {tr(k === "INCOME" ? "entries.tab.income" : "entries.tab.expense")}
                </button>
              ))}
            </div>
          ) : null}

          <div className="grid-2">
            <SelectField
              id="e-period"
              label={tr("entry.field.period")}
              value={form.period}
              onChange={(e) => set("period", e.target.value)}
              error={errors.period}
              options={openMonths.map((p) => ({ value: p.month, label: monthLabel(locale, p.month) }))}
            />
            <SelectField
              id="e-category"
              label={tr("entry.field.category")}
              value={form.categoryId}
              onChange={(e) => set("categoryId", e.target.value)}
              error={errors.categoryId}
              options={[{ value: "", label: tr("entry.ph.choose") }, ...categoryOptions.map((c) => ({ value: c.id, label: categoryName(locale, c) }))]}
            />
          </div>

          {needsReference ? (
            <SelectField
              id="e-reference"
              label={tr("entry.field.reference")}
              hint={tr("entry.field.referenceHint")}
              value={form.referencePeriod}
              onChange={(e) => set("referencePeriod", e.target.value)}
              error={errors.referencePeriod}
              options={[{ value: "", label: tr("entry.ph.choose") }, ...closedBefore.map((p) => ({ value: p.month, label: monthLabel(locale, p.month) }))]}
            />
          ) : null}

          <Field>
            <FieldLabel htmlFor="e-amount" className="text-xs font-semibold text-muted-foreground">
              {tr("entry.field.amount")}
            </FieldLabel>
            <Input
              id="e-amount"
              name="amount"
              inputMode="decimal"
              autoComplete="off"
              className="amount-input"
              placeholder={tr("entry.ph.amount")}
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
              aria-invalid={amountError ? true : undefined}
              aria-describedby={amountError ? "e-amount-error" : undefined}
            />
            {amountError ? (
              <FieldError id="e-amount-error" className="text-xs font-semibold">
                {amountError}
              </FieldError>
            ) : null}
          </Field>

          <div className="grid-2">
            <DateField
              id="e-date"
              label={tr("entry.field.date")}
              placeholder={tr("entry.ph.date")}
              clearLabel={tr("common.clear")}
              locale={locale}
              disableFuture
              fromYear={2020}
              value={form.txnDate}
              onChange={(v) => set("txnDate", v)}
              error={errors.txnDate}
            />
            <SelectField
              id="e-fund"
              label={tr("entry.field.fund")}
              value={form.fundAccountId}
              onChange={(e) => {
                setFundTouched(true);
                set("fundAccountId", e.target.value);
              }}
              error={errors.fundAccountId}
              options={[
                { value: "", label: tr("entry.ph.choose") },
                ...funds.map((f) => ({ value: f.id, label: tr("entry.fundOption", { name: f.name, balance: formatMoney(locale, f.balancePaisa) }) })),
              ]}
            />
          </div>

          {form.kind === "INCOME" ? (
            <SelectField
              id="e-unit"
              label={tr("entry.field.unit")}
              value={form.unitId}
              onChange={(e) => pickUnit(e.target.value)}
              error={errors.unitId}
              options={[
                { value: "", label: tr("entry.ph.choose") },
                ...units.map((u) => ({ value: u.id, label: u.tenantName ? tr("entry.unitOption", { name: u.name, tenant: u.tenantName }) : u.name })),
              ]}
            />
          ) : (
            <>
              <TextField
                id="e-vendor"
                label={tr("entry.field.vendor")}
                placeholder={tr("entry.ph.vendor")}
                list="e-vendor-list"
                autoComplete="off"
                maxLength={100}
                value={form.vendor}
                onChange={(e) => set("vendor", e.target.value)}
                error={errors.vendor}
              />
              <datalist id="e-vendor-list">
                {vendors.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
              <div className="flex flex-col gap-1">
                <div className="flex min-h-11 items-center gap-2.5">
                  <Checkbox id="e-reserve" checked={form.fromReserve} onCheckedChange={(v) => set("fromReserve", v === true)} aria-describedby="e-reserve-hint" />
                  <Label htmlFor="e-reserve" className="text-sm font-semibold">
                    {tr("entry.field.reserve")}
                  </Label>
                </div>
                <FieldDescription id="e-reserve-hint" className="text-xs">
                  {tr("entry.field.reserveHint")}
                </FieldDescription>
              </div>
            </>
          )}

          <TextField
            id="e-description"
            label={tr("entry.field.description")}
            placeholder={tr("entry.ph.description")}
            maxLength={200}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            error={errors.description}
          />

          {!correcting ? <AttachmentPicker locale={locale} onChange={(ids, busy) => setUploads({ ids, busy })} /> : null}

          {correcting ? (
            <TextField
              id="e-reason"
              label={tr("entry.field.reason")}
              placeholder={tr("entry.ph.reason")}
              maxLength={500}
              value={form.reason}
              onChange={(e) => set("reason", e.target.value)}
              error={errors.reason}
              required
            />
          ) : null}
        </form>
        <SheetFooter className="flex-row justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose}>
            {tr("common.cancel")}
          </Button>
          <Button type="submit" form={formId} disabled={pending || uploads.busy}>
            {saveLabel}
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
