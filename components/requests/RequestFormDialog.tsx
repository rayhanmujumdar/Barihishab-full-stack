"use client";

import { useState, type FormEvent } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ErrorStrip } from "@/components/forms/error-strip";
import { DateField, SelectField, TextField } from "@/components/forms/fields";
import { AttachmentPicker } from "@/components/entries/AttachmentPicker";
import { Choice } from "@/components/owners/Choice";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api/client";
import { apiGet, useApiMutation } from "@/lib/api/query";
import { todayIsoInDhaka } from "@/lib/clock";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { translator, type Locale, type MessageKey } from "@/lib/i18n";
import { formatMoney, paisaToInput, parseAmount } from "@/lib/money";
import type { FormContextDto, RequestDetailDto, RequestWarning } from "@/lib/requests/dto";
import { cn } from "@/lib/utils";
import { inDays, reqNumber } from "./format";
import type { OwnerOption, RequestDto, RequestType } from "./types";

const TYPES: RequestType[] = ["ADVANCE", "LOAN", "GRANT"];
const MAX_FILES = 3;

/** F2 / F3 / F11: request money, edit a pending request, or record one for an owner. */
export function RequestFormDialog({
  locale,
  mode,
  request,
  owners,
  ownOwnerId,
  onClose,
  onDone,
}: {
  locale: Locale;
  mode: "new" | "record" | "edit";
  request?: RequestDto;
  owners: OwnerOption[];
  ownOwnerId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const tr = translator(locale);
  const editing = mode === "edit" && request;
  const today = todayIsoInDhaka();
  const [ownerId, setOwnerId] = useState(editing ? request.ownerId : mode === "record" ? "" : (ownOwnerId ?? ""));
  const [type, setType] = useState<RequestType>(editing ? request.type : "ADVANCE");
  const [amount, setAmount] = useState(editing ? paisaToInput(request.amountRequestedPaisa) : "");
  const [reason, setReason] = useState(editing ? request.reason : "");
  const [neededBy, setNeededBy] = useState(editing ? request.neededBy : inDays(today, 7));
  const [plan, setPlan] = useState(editing ? (request.repaymentPlan ?? "") : "");
  const [files, setFiles] = useState<{ ids: string[]; busy: boolean }>({ ids: [], busy: false });
  const [privateIds, setPrivateIds] = useState<string[]>([]);
  // Edit (F3): files already on the request, which the requester may remove.
  const [removeIds, setRemoveIds] = useState<string[]>([]);
  const filesQuery = useQuery({
    queryKey: ["requests", "detail", request?.id],
    enabled: !!editing && request.attachmentCount > 0,
    queryFn: () => apiGet<RequestDetailDto>(`/requests/${request!.id}`),
  });
  const kept = (filesQuery.data?.attachments ?? []).filter((a) => !removeIds.includes(a.id));
  const existingCount = editing ? (filesQuery.data ? kept.length : request.attachmentCount) : 0;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const paisa = parseAmount(amount);
  const grantAmount = useDebouncedValue(type === "GRANT" ? paisa : null);
  const ctxQuery = useQuery({
    queryKey: ["requests", "form-context", ownerId, grantAmount],
    enabled: !!ownerId,
    queryFn: () => apiGet<FormContextDto>(`/requests/form-context?ownerId=${ownerId}${grantAmount ? `&amountPaisa=${grantAmount}` : ""}`),
    // Keep the hints steady while the grant amount changes, never across owners.
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[2] === ownerId ? prev : undefined),
  });
  const ctx = ctxQuery.data;

  const save = useApiMutation(["requests", mode, request?.id ?? "new"], (body: Record<string, unknown>) =>
    editing
      ? apiFetch<{ request: RequestDto; warnings: RequestWarning[] }>(`/requests/${request.id}`, { method: "PATCH", body })
      : apiFetch<{ request: RequestDto; warnings: RequestWarning[] }>("/requests", { method: "POST", body }),
  );

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!ownerId) e.ownerId = tr("req.err.owner");
    if (!paisa) e.amountPaisa = tr("req.err.amount");
    else if (paisa < 100) e.amountPaisa = tr("req.err.minAmount");
    if (reason.trim().length < 10) e.reason = tr("req.err.reason");
    // An overdue pending request stays editable: its old date is only re-checked if changed.
    const dateChanged = !editing || neededBy !== request.neededBy;
    if (!neededBy || (dateChanged && neededBy < today)) e.neededBy = tr("req.err.neededBy");
    return e;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (save.isPending || files.busy) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setError(null);
    const body: Record<string, unknown> = {
      type,
      amountPaisa: paisa,
      reason: reason.trim(),
      ...(!editing || neededBy !== request.neededBy ? { neededBy } : {}),
      repaymentPlan: type === "LOAN" ? plan.trim() || null : null,
      ...(files.ids.length ? { attachmentIds: files.ids, privateAttachmentIds: privateIds.filter((id) => files.ids.includes(id)) } : {}),
      ...(removeIds.length ? { removeAttachmentIds: removeIds } : {}),
      ...(mode === "record" || (mode === "new" && ownerId !== ownOwnerId) ? { ownerId } : {}),
    };
    const res = await save.run(body);
    if (!res.ok) {
      const fields = res.error.details?.fields ?? {};
      setErrors(fields);
      return setError(Object.keys(fields).length ? null : res.status === 0 ? tr("common.network") : res.error.message);
    }
    toast(editing ? tr("req.toast.edited") : tr("req.toast.sent"));
    onDone();
  }

  const m = (p: number) => formatMoney(locale, p);
  const hints: { text: string; warn?: boolean }[] = [];
  if (ctx) {
    if (type === "ADVANCE" && ctx.advanceLimitPaisa !== null) {
      hints.push({ text: tr("req.hint.limit", { limit: m(ctx.advanceLimitPaisa), used: m(ctx.advanceUsedPaisa) }) });
      if (paisa && ctx.advanceUsedPaisa + paisa > ctx.advanceLimitPaisa) hints.push({ text: tr("req.warn.overLimit"), warn: true });
    }
    if (type === "ADVANCE" && ctx.balancePaisa > 0) hints.push({ text: tr("req.hint.owed", { amount: m(ctx.balancePaisa) }), warn: true });
    const loan = ctx.activeLoans.at(-1);
    if (type === "LOAN" && loan) hints.push({ text: tr("req.hint.hasLoan", { loan: tr("al.loanNo", { n: loan.number }), amount: m(loan.outstandingPaisa) }), warn: true });
    if (type === "GRANT" && ctx.grantPerTenPctPaisa !== null) hints.push({ text: tr("req.hint.grant", { amount: m(ctx.grantPerTenPctPaisa) }) });
    const others = ctx.pendingNumbers.filter((n) => n !== request?.number);
    if (others.length) hints.push({ text: tr("req.warn.pending", { number: others.map((n) => reqNumber(locale, n)).join(", ") }), warn: true });
  }

  const title = editing ? tr("req.form.editTitle", { number: reqNumber(locale, request.number) }) : mode === "record" ? tr("req.form.recordTitle") : tr("req.form.title");
  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="max-h-[100dvh] overflow-y-auto max-sm:h-[100dvh] max-sm:max-w-full sm:max-h-[90vh] sm:max-w-[560px]" lang={locale}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{tr("req.form.sub")}</DialogDescription>
        </DialogHeader>
        <form id="request-form" className="form-stack" onSubmit={onSubmit} noValidate>
          <ErrorStrip message={error} />
          {mode === "record" ? (
            <SelectField
              id="req-owner"
              label={tr("req.form.owner")}
              required
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              error={errors.ownerId}
              options={[{ value: "", label: tr("pay.choose") }, ...owners.map((o) => ({ value: o.id, label: o.name }))]}
            />
          ) : null}
          <Choice id="req-type" label={tr("req.form.type")} value={type} onChange={setType} options={TYPES.map((x) => ({ value: x, label: tr(`req.type.${x}` as MessageKey) }))} />
          <p className="muted m-0 text-sm">{tr(`req.help.${type}` as MessageKey)}</p>
          {ctx ? (
            <p className="m-0 font-semibold">
              {tr("req.form.balance")}{" "}
              <span className={cn(ctx.balancePaisa > 0 ? "bal-pos" : ctx.balancePaisa < 0 ? "bal-neg" : "")}>
                {m(ctx.balancePaisa)} · {tr(ctx.balancePaisa > 0 ? "req.ctx.owed" : ctx.balancePaisa < 0 ? "req.ctx.advance" : "req.ctx.settled")}
              </span>
            </p>
          ) : null}
          <TextField
            id="req-amount"
            label={tr("req.form.amount")}
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
          <TextField
            id="req-reason"
            label={tr("req.form.reason")}
            hint={tr("req.form.reasonHint")}
            placeholder={tr("req.form.reasonPh")}
            required
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={errors.reason}
          />
          <DateField
            id="req-needed"
            label={tr("req.form.neededBy")}
            required
            requiredText={tr("common.required")}
            placeholder={tr("pay.datePh")}
            clearLabel={tr("common.clear")}
            locale={locale}
            disablePast
            value={neededBy}
            onChange={setNeededBy}
            error={errors.neededBy}
          />
          {type === "LOAN" ? (
            <TextField id="req-plan" label={tr("req.form.plan")} placeholder={tr("req.form.planPh")} maxLength={200} value={plan} onChange={(e) => setPlan(e.target.value)} error={errors.repaymentPlan} />
          ) : null}
          {hints.length ? (
            <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-live="polite">
              {hints.map((h) => (
                <li key={h.text} className={cn("text-sm", h.warn && "bal-neg font-semibold")}>
                  {h.warn ? "⚠ " : ""}
                  {h.text}
                </li>
              ))}
            </ul>
          ) : null}
          {kept.length ? (
            <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={tr("req.files.current")}>
              {kept.map((a) => (
                <li key={a.id} className="flex min-h-11 items-center justify-between gap-2 border-b border-[var(--color-divider)]">
                  <span className="truncate text-sm">
                    {a.fileName}
                    {a.isPrivate ? ` · ${tr("req.files.private")}` : ""}
                  </span>
                  <Button type="button" variant="ghost" size="icon" aria-label={tr("entry.files.remove", { name: a.fileName })} onClick={() => setRemoveIds((x) => [...x, a.id])}>
                    <XMarkIcon />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {existingCount < MAX_FILES ? (
            <AttachmentPicker locale={locale} max={MAX_FILES} text={{ title: tr("req.files.title"), hint: tr("req.files.hint"), tooMany: tr("req.files.tooMany") }} existing={existingCount} onChange={(ids, busy) => setFiles({ ids, busy })} />
          ) : null}
          {files.ids.length ? (
            <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
              <legend className="text-xs font-semibold text-muted-foreground">{tr("req.form.private")}</legend>
              {files.ids.map((id, i) => (
                <div key={id} className="flex min-h-11 items-center gap-2">
                  <Checkbox
                    id={`req-private-${id}`}
                    checked={privateIds.includes(id)}
                    onCheckedChange={(c) => setPrivateIds((p) => (c ? [...p, id] : p.filter((x) => x !== id)))}
                  />
                  <Label htmlFor={`req-private-${id}`} className="text-sm">
                    {tr("req.form.privateFile", { n: i + 1 })}
                  </Label>
                </div>
              ))}
              <p className="muted m-0 text-xs">{tr("req.form.privateHint")}</p>
            </fieldset>
          ) : null}
          {errors.attachmentIds ? (
            <p className="m-0 text-xs font-semibold text-destructive" role="alert">
              {errors.attachmentIds}
            </p>
          ) : null}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            {tr("common.cancel")}
          </Button>
          <Button type="submit" form="request-form" disabled={save.isPending || files.busy}>
            {editing ? tr("req.form.save") : tr("req.form.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
