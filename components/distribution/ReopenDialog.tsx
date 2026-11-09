"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ErrorStrip } from "@/components/forms/error-strip";
import { TextField } from "@/components/forms/fields";
import { num } from "@/components/owners/format";
import { apiFetch } from "@/lib/api/client";
import { useApiMutation } from "@/lib/api/query";
import { translator, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import { formatDay } from "./format";
import type { DistributionDto } from "./types";

/** Reopen the latest closed month (F7, G5): reason required, payouts since the close listed. */
export function ReopenDialog({ locale, data, onClose, onDone }: { locale: Locale; data: DistributionDto; onClose: () => void; onDone: () => void }) {
  const tr = translator(locale);
  const month = data.month.key;
  const label = monthLabel(locale, month);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reopen = useApiMutation(["distribution", "reopen", month], (r: string) => apiFetch(`/periods/${month}/reopen`, { method: "POST", body: { reason: r } }));
  const after = data.paidAfterClose;
  const count = data.rows.filter((r) => r.entitlementPaisa > 0).length;

  async function confirm() {
    setTouched(true);
    if (!reason.trim()) return;
    setError(null);
    const res = await reopen.run(reason.trim());
    if (!res.ok) return setError(res.status === 0 ? tr("common.network") : res.error.message);
    toast(tr("dist.reopen.toast", { month: label }));
    onDone();
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={tr("dist.reopen.title", { month: label })}
      description={tr("dist.reopen.body", { n: num(locale, count) })}
      confirmLabel={tr("dist.reopen.confirm")}
      cancelLabel={tr("common.cancel")}
      busy={reopen.isPending}
      onConfirm={confirm}
    >
      {after && after.items.length ? (
        <div className="flex flex-col gap-2 bg-[var(--neg-100)] p-3 text-sm text-[var(--neg-800)]" style={{ borderTop: "2px solid var(--neg-700)" }} role="note">
          <p className="m-0 font-semibold">{tr("dist.reopen.paidAfter", { amount: formatMoney(locale, after.totalPaisa), month: label })}</p>
          <ul className="m-0 list-disc pl-5">
            {after.items.map((i, k) => (
              <li key={k}>
                {i.displayName} · {formatMoney(locale, i.amountPaisa)} · {formatDay(locale, i.date)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ErrorStrip message={error} />
      <TextField
        id="reopen-reason"
        label={tr("dist.reopen.reason")}
        placeholder={tr("dist.reopen.reasonPh")}
        required
        maxLength={300}
        value={reason}
        error={touched && !reason.trim() ? tr("dist.reopen.reasonRequired") : undefined}
        onChange={(e) => setReason(e.target.value)}
      />
    </ConfirmDialog>
  );
}
