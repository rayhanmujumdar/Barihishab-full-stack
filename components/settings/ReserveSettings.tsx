"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ErrorStrip } from "@/components/forms/error-strip";
import { TextField } from "@/components/forms/fields";
import { Choice } from "@/components/owners/Choice";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { useApiMutation } from "@/lib/api/query";
import { translator, type Locale } from "@/lib/i18n";
import { formatMoney, paisaToInput, parseAmount } from "@/lib/money";
import type { ReserveSettings as Rule } from "@/lib/distribution/reserve-service";

type Mode = Rule["mode"];

/** "5" / "2.5" → basis points (500 / 250); null when not 0.01–100. */
function parsePercent(v: string): number | null {
  const s = v.trim().replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - "০".charCodeAt(0)));
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const bp = Math.round(Number(s) * 100);
  return bp >= 1 && bp <= 10000 ? bp : null;
}

/** Settings › Reserve holdback (Distribution PRD F9, SET-02). */
export function ReserveSettings({ locale, rule, balancePaisa }: { locale: Locale; rule: Rule; balancePaisa: number }) {
  const tr = translator(locale);
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(rule.mode);
  const [percent, setPercent] = useState(rule.mode === "PERCENT" ? String(rule.percentBp / 100) : "");
  const [fixed, setFixed] = useState(rule.mode === "FIXED" ? paisaToInput(rule.fixedPaisa) : "");
  const [starting, setStarting] = useState(rule.startingPaisa ? paisaToInput(rule.startingPaisa) : "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const save = useApiMutation(["settings", "reserve"], (body: Rule) => apiFetch("/settings/reserve", { method: "PUT", body }));
  const balance = formatMoney(locale, balancePaisa);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const e: Record<string, string> = {};
    const startingPaisa = starting.trim() === "" || /^[0০]+$/.test(starting.trim()) ? 0 : parseAmount(starting);
    if (startingPaisa === null) e.startingPaisa = tr("pay.err.amount");
    let body: Rule | null = null;
    if (mode === "PERCENT") {
      const bp = parsePercent(percent);
      if (bp === null) e.percentBp = tr("pay.err.amount");
      else body = { mode, percentBp: bp, startingPaisa: startingPaisa ?? 0 };
    } else if (mode === "FIXED") {
      const p = parseAmount(fixed);
      if (p === null) e.fixedPaisa = tr("pay.err.amount");
      else body = { mode, fixedPaisa: p, startingPaisa: startingPaisa ?? 0 };
    } else body = { mode: "OFF", startingPaisa: startingPaisa ?? 0 };
    setErrors(e);
    if (Object.keys(e).length || !body) return;
    setError(null);
    const res = await save.run(body);
    if (!res.ok) {
      setErrors(res.error.details?.fields ?? {});
      return setError(res.status === 0 ? tr("common.network") : res.error.message);
    }
    toast(tr("settings.saved"));
    router.refresh();
  }

  return (
    <section aria-labelledby="reserve-title">
      <div className="section-head">
        <h2 id="reserve-title">{tr("settings.reserve")}</h2>
        <span className="kicker">{tr("settings.reserve.balance", { amount: balance })}</span>
      </div>
      <form className="form-stack max-w-[520px]" onSubmit={onSubmit} noValidate>
        <ErrorStrip message={error} />
        <Choice
          id="reserve-mode"
          label={tr("settings.reserve.mode")}
          value={mode}
          onChange={setMode}
          options={(["OFF", "PERCENT", "FIXED"] as const).map((m) => ({ value: m, label: tr(`settings.reserve.${m}`) }))}
        />
        {mode === "PERCENT" ? (
          <TextField id="reserve-percent" label={tr("settings.reserve.percent")} inputMode="decimal" required value={percent} error={errors.percentBp} onChange={(e) => setPercent(e.target.value)} />
        ) : null}
        {mode === "FIXED" ? (
          <TextField id="reserve-fixed" label={tr("settings.reserve.fixed")} inputMode="decimal" required value={fixed} error={errors.fixedPaisa} onChange={(e) => setFixed(e.target.value)} />
        ) : null}
        <TextField id="reserve-starting" label={tr("settings.reserve.starting")} inputMode="decimal" value={starting} error={errors.startingPaisa} onChange={(e) => setStarting(e.target.value)} />
        <p className="muted m-0">{tr("settings.reserve.hint")}</p>
        <Button type="submit" className="self-start" disabled={save.isPending}>
          {tr("settings.reserve.save")}
        </Button>
      </form>
    </section>
  );
}
