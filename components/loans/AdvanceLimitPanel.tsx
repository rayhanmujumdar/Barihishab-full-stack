"use client";

import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { balanceTone, signedMoney } from "@/components/owners/format";
import { translator, type Locale, type MessageKey } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { pctText } from "./format";

export type LimitStanding = { displayName: string; balancePaisa: number; limitPaisa: number | null };

/** F12/F14 live panel: balance, advance limit and how much of it this advance uses; warnings never block. */
export function AdvanceLimitPanel({ locale, owner, amountPaisa }: { locale: Locale; owner: LimitStanding; amountPaisa: number | null }) {
  const tr = translator(locale);
  const outstanding = Math.max(0, -owner.balancePaisa);
  const used = owner.limitPaisa ? Math.round(((outstanding + (amountPaisa ?? 0)) * 100) / owner.limitPaisa) : null;
  const word = tr(`owners.balance.${owner.balancePaisa > 0 ? "OWED" : owner.balancePaisa < 0 ? "ADVANCE" : "SETTLED"}` as MessageKey);
  const warnings: string[] = [];
  if (owner.balancePaisa > 0) warnings.push(tr("al.warn.owed", { name: owner.displayName, amount: formatMoney(locale, owner.balancePaisa) }));
  if (used !== null && used > 100) warnings.push(tr("pay.warn.limit"));
  return (
    <div className="flex flex-col gap-2" data-testid="advance-limit-panel">
      <dl className="kv border-t-2 border-foreground bg-[var(--color-surface)] p-3">
        <dt>{tr("al.panel.balance")}</dt>
        <dd className={cn("font-extrabold", `bal-${balanceTone(owner.balancePaisa)}`)}>
          {signedMoney(locale, owner.balancePaisa)} · {word}
        </dd>
        <dt>{tr("al.panel.limit")}</dt>
        <dd className="font-extrabold">{owner.limitPaisa === null ? tr("al.panel.noLimit") : formatMoney(locale, owner.limitPaisa)}</dd>
        {used !== null ? (
          <>
            <dt>{tr("al.own.col.used")}</dt>
            <dd>{tr("al.panel.used", { pct: pctText(locale, used) })}</dd>
          </>
        ) : null}
      </dl>
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
    </div>
  );
}
