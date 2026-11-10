"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ErrorStrip } from "@/components/forms/error-strip";
import { multiplierText } from "@/components/loans/format";
import { Choice } from "@/components/owners/Choice";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { useApiMutation } from "@/lib/api/query";
import { translator, type Locale } from "@/lib/i18n";

const OPTIONS = ["50", "100", "150", "200"] as const;

/** Settings › Advance limit (Advances & Loans PRD F14; SET-02). */
export function AdvanceLimitSettings({ locale, multiplierPct }: { locale: Locale; multiplierPct: number }) {
  const tr = translator(locale);
  const router = useRouter();
  const [value, setValue] = useState<(typeof OPTIONS)[number]>(String(multiplierPct) as (typeof OPTIONS)[number]);
  const [error, setError] = useState<string | null>(null);
  const save = useApiMutation(["settings", "advance-limit"], (body: { multiplierPct: number }) => apiFetch("/settings/advance-limit", { method: "PUT", body }));

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    const res = await save.run({ multiplierPct: Number(value) });
    if (!res.ok) return setError(res.status === 0 ? tr("common.network") : res.error.message);
    toast(tr("set.advance.saved"));
    router.refresh();
  }

  return (
    <section aria-labelledby="advance-limit-title">
      <div className="section-head">
        <h2 id="advance-limit-title">{tr("set.advance.title")}</h2>
      </div>
      <form className="form-stack max-w-[520px]" onSubmit={onSubmit} noValidate>
        <ErrorStrip message={error} />
        <Choice id="advance-limit" label={tr("set.advance.label")} value={value} onChange={setValue} options={OPTIONS.map((o) => ({ value: o, label: multiplierText(locale, Number(o)) }))} />
        <p className="muted m-0">{tr("set.advance.help")}</p>
        <Button type="submit" className="self-start" disabled={save.isPending}>
          {tr("set.advance.save")}
        </Button>
      </form>
    </section>
  );
}
