"use client";

import { CheckCircleIcon, ExclamationTriangleIcon, LockClosedIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ErrorStrip } from "@/components/forms/error-strip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api/client";
import { apiGet, queryErrorMessage, useApiMutation } from "@/lib/api/query";
import { translator, type Locale, type MessageKey } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import { num } from "@/components/owners/format";
import { ChangesTable } from "./ChangesTable";
import type { ClosePreviewDto } from "./types";
import { ClosePreviewSkeleton } from "@/components/skeletons/overlays";

type Check = ClosePreviewDto["mustPass"][number];
type Warning = ClosePreviewDto["warnings"][number];

export const closePreviewKey = (month: string) => ["distribution", "close-preview", month] as const;

/** Close month (F5, F6, F8, G2, G12): must-pass checks, warnings, what happens, then Close & lock. */
export function CloseMonthDialog({ locale, month, onClose, onDone }: { locale: Locale; month: string; onClose: () => void; onDone: () => void }) {
  const tr = translator(locale);
  const label = monthLabel(locale, month);
  const money = (p: number) => formatMoney(locale, p);
  const [error, setError] = useState<string | null>(null);
  const preview = useQuery({ queryKey: closePreviewKey(month), queryFn: () => apiGet<ClosePreviewDto>(`/periods/${month}/close-preview`), staleTime: 0 });
  const close = useApiMutation(["distribution", "close", month], (reopenCount: number) => apiFetch(`/periods/${month}/close`, { method: "POST", body: { reopenCount } }));
  const p = preview.data;

  function checkText(c: Check): string {
    const m = c.month ? monthLabel(locale, c.month) : label;
    if (c.code === "SHARES") return c.ok ? tr("dist.check.SHARES.ok", { n: num(locale, p?.whatHappens.ownerCount ?? 0) }) : tr("dist.check.SHARES.fail", { month: label });
    if (c.code === "PREVIOUS_CLOSED") return c.ok ? (c.month ? tr("dist.check.PREVIOUS_CLOSED.ok", { month: m }) : tr("dist.check.PREVIOUS_CLOSED.first")) : tr("dist.check.PREVIOUS_CLOSED.fail", { month: m });
    return tr(`dist.check.${c.code}.${c.ok ? "ok" : "fail"}` as MessageKey);
  }

  function warningText(w: Warning): string {
    if (w.code === "UNPAID_RENT") {
      const units = (w.units ?? []).map((u) => (u.tenantName ? `${u.name} (${u.tenantName})` : u.name)).join(", ");
      return tr("dist.warn.UNPAID_RENT", { n: num(locale, w.units?.length ?? 0), units });
    }
    if (w.code === "MISSING_BILLS") return tr("dist.warn.MISSING_BILLS", { n: num(locale, w.count ?? 0) });
    if (w.code === "MONTH_NOT_OVER") return tr("dist.warn.MONTH_NOT_OVER", { month: label, next: monthLabel(locale, w.nextMonth ?? month) });
    if (w.code === "RESERVE_NEGATIVE") return tr("dist.warn.RESERVE_NEGATIVE", { amount: money(w.reserveAfterClosePaisa ?? 0) });
    if (w.code === "OPEN_COMPLAINTS") return tr("dist.warn.OPEN_COMPLAINTS", { n: num(locale, w.count ?? 0), month: label });
    return tr("dist.warn.NO_INCOME");
  }

  async function confirm() {
    if (!p) return;
    setError(null);
    const res = await close.run(p.reopenCount);
    if (!res.ok) {
      const d = res.error.details as { closedBy?: string | null } | undefined;
      if (res.error.code === "PERIOD_ALREADY_CLOSED") setError(tr("dist.close.already", { month: label, name: d?.closedBy ?? "—" }));
      else setError(res.status === 0 ? tr("common.network") : res.error.message);
      void preview.refetch();
      return;
    }
    toast(tr("dist.close.toast", { month: label }));
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !close.isPending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>{tr("dist.close.title", { month: label })}</DialogTitle>
          <DialogDescription className="sr-only">{tr("dist.close.what")}</DialogDescription>
        </DialogHeader>
        <ErrorStrip message={error ?? queryErrorMessage(preview.error, tr("common.network"))} />
        {!p ? (
          preview.isPending ? <ClosePreviewSkeleton locale={locale} /> : null
        ) : (
          <div className="form-stack">
            <section aria-label={tr("dist.close.checks")}>
              <h3 className="kicker mb-2">{tr("dist.close.checks")}</h3>
              <ul className="check-list">
                {p.mustPass.map((c) => (
                  <li key={c.code} className={c.ok ? undefined : "bal-neg font-semibold"} data-check={c.code} data-ok={c.ok}>
                    {c.ok ? <CheckCircleIcon className="bal-pos size-5 shrink-0" aria-hidden /> : <XCircleIcon className="size-5 shrink-0" aria-hidden />}
                    <span>
                      <span className="sr-only">{tr(c.ok ? "dist.check.passed" : "dist.check.failed")} </span>
                      {checkText(c)}
                    </span>
                  </li>
                ))}
                {p.warnings.map((w) => (
                  <li key={w.code} data-warning={w.code}>
                    <ExclamationTriangleIcon className="size-5 shrink-0 text-[var(--color-accent-800)]" aria-hidden />
                    <span>
                      <span className="sr-only">{tr("dist.check.warning")} </span>
                      {warningText(w)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-label={tr("dist.close.what")}>
              <h3 className="kicker mb-2">{tr("dist.close.what")}</h3>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm">
                <li>{tr("dist.close.entitlements", { n: num(locale, p.whatHappens.entitlementCount), amount: money(p.whatHappens.entitlementTotalPaisa) })}</li>
                {p.whatHappens.deductions.map((d) => (
                  <li key={d.ownerId}>{tr("dist.close.loan", { amount: money(d.amountPaisa), name: d.displayName })}</li>
                ))}
                {p.whatHappens.skipped.map((s) => (
                  <li key={s.ownerId}>{tr("dist.skipped", { name: s.displayName })}</li>
                ))}
                <li>{tr("dist.close.locks", { month: label })}</li>
                <li>{tr("dist.close.snapshot")}</li>
                {p.whatHappens.nextMonthOpens ? <li>{tr("dist.close.nextOpens", { month: monthLabel(locale, p.whatHappens.nextMonthOpens) })}</li> : null}
              </ul>
            </section>
            {p.changes ? (
              <section aria-label={tr("dist.close.changes")}>
                <h3 className="kicker mb-2">{tr("dist.close.changes")}</h3>
                <ChangesTable locale={locale} changes={p.changes} />
              </section>
            ) : null}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={close.isPending}>
            {tr("dist.close.notYet")}
          </Button>
          <Button onClick={confirm} disabled={!p?.canClose || close.isPending}>
            <LockClosedIcon data-icon="inline-start" />
            {tr("dist.close.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
