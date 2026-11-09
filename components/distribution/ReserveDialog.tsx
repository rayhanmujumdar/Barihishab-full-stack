"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ErrorStrip } from "@/components/forms/error-strip";
import { RequiredLegend, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api/client";
import { useApiMutation } from "@/lib/api/query";
import { translator, type Locale } from "@/lib/i18n";
import { formatMoney, paisaToInput, parseAmount } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import { reserveRuleText } from "./Staircase";
import type { DistributionDto } from "./types";

type Body = { amountPaisa: number | null; reason?: string };

/** Reserve cell detail: the rule used, the reserve balance, and — on an open month — the override (F9, G3). */
export function ReserveDialog({ locale, data, canOverride, onClose, onDone }: { locale: Locale; data: DistributionDto; canOverride: boolean; onClose: () => void; onDone: () => void }) {
  const tr = translator(locale);
  const month = data.month.key;
  const editable = canOverride && data.month.status === "OPEN";
  const current = data.reserve.overridePaisa;
  const [amount, setAmount] = useState(current !== null ? paisaToInput(current) : "");
  const [reason, setReason] = useState(data.reserve.overrideReason ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const save = useApiMutation(["distribution", "reserve", month], (body: Body) => apiFetch(`/periods/${month}/reserve`, { method: "PUT", body }));

  async function send(body: Body, done: string) {
    setError(null);
    const res = await save.run(body);
    if (!res.ok) {
      setErrors(res.error.details?.fields ?? {});
      return setError(res.status === 0 ? tr("common.network") : res.error.message);
    }
    toast(done);
    onDone();
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    // 0 is a valid override ("no reserve this month"); parseAmount only accepts positive amounts.
    const paisa = /^[0০]+([.,][0০]*)?$/.test(amount.trim()) ? 0 : parseAmount(amount);
    const e: Record<string, string> = {};
    if (paisa === null) e.amountPaisa = tr("pay.err.amount");
    if (!reason.trim()) e.reason = tr("dist.reopen.reasonRequired");
    setErrors(e);
    if (Object.keys(e).length) return;
    await send({ amountPaisa: paisa, reason: reason.trim() }, tr("dist.override.saved"));
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{tr("dist.reserveDetails")}</DialogTitle>
          <DialogDescription>{reserveRuleText(locale, data)}</DialogDescription>
        </DialogHeader>
        <dl className="kv">
          <dt>{tr("dist.reserve")}</dt>
          <dd className="font-extrabold">{formatMoney(locale, data.staircase.reservePaisa)}</dd>
          <dt>{tr("dist.reserveDetails")}</dt>
          <dd>{tr("dist.reserveBalance", { amount: formatMoney(locale, data.reserve.balancePaisa) })}</dd>
        </dl>
        {editable ? (
          <form className="form-stack" onSubmit={onSubmit} noValidate>
            <h3 className="kicker">{tr("dist.override.title")} · {monthLabel(locale, month)}</h3>
            <RequiredLegend text={tr("common.required")} />
            <ErrorStrip message={error} />
            <TextField id="reserve-amount" label={tr("dist.override.amount")} inputMode="decimal" required value={amount} error={errors.amountPaisa} onChange={(e) => setAmount(e.target.value)} />
            <TextField
              id="reserve-reason"
              label={tr("dist.override.reason")}
              placeholder={tr("dist.override.reasonPh")}
              required
              maxLength={300}
              value={reason}
              error={errors.reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <DialogFooter>
              {current !== null ? (
                <Button type="button" variant="outline" disabled={save.isPending} onClick={() => send({ amountPaisa: null }, tr("dist.override.resetDone"))}>
                  {tr("dist.override.reset")}
                </Button>
              ) : null}
              <Button type="submit" disabled={save.isPending}>
                {tr("dist.override.save")}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {tr("common.close")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
