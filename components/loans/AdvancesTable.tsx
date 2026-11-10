"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { balanceTone, ownerHref, signedMoney } from "@/components/owners/format";
import { translator, type Locale, type MessageKey } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import { cn } from "@/lib/utils";
import { multiplierText, shortDate } from "./format";
import type { AdvanceRowDto } from "./types";

/** Advance history (F11): one card-row per advance; tap → owner's statement from that month. */
export function AdvancesTable({ locale, rows, multiplierPct }: { locale: Locale; rows: AdvanceRowDto[]; multiplierPct: number }) {
  const tr = translator(locale);
  const balanceWord = (paisa: number) => tr(`owners.balance.${paisa > 0 ? "OWED" : paisa < 0 ? "ADVANCE" : "SETTLED"}` as MessageKey);
  return (
    <section aria-label={tr("al.adv.list")} className="flex flex-col gap-3">
      {rows.length === 0 ? <p className="m-0 border-t-2 border-foreground pt-4">{tr("al.empty.advances")}</p> : null}
      <ul className="m-0 list-none border-t-2 border-foreground p-0">
        {rows.map((a) => {
          const status =
            a.status === "VOID"
              ? tr("al.adv.VOID", { reason: a.voidReason ?? "" })
              : a.status === "RECOVERED"
                ? tr("al.adv.RECOVERED", { month: monthLabel(locale, a.recoveredMonth!) })
                : tr("al.adv.OUTSTANDING");
          return (
            <li key={a.id} data-void={a.status === "VOID" ? "true" : undefined}>
              <Link
                href={ownerHref(locale, a.ownerId, { from: a.month })}
                className="flex flex-col gap-1 border-b border-[var(--color-divider)] py-3 text-foreground no-underline hover:bg-[var(--color-neutral-200)] sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex flex-col">
                  <span className={cn("font-bold", a.status === "VOID" && "text-[var(--color-neutral-600)] line-through")}>
                    {shortDate(locale, a.date)} · {a.ownerName} · {formatMoney(locale, a.amountPaisa)}
                  </span>
                  <span className="muted">
                    {a.reason ?? ""} · {tr(a.origin === "PAYOUT_SPLIT" ? "al.adv.source.PAYOUT_SPLIT" : "al.adv.source.DIRECT")}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {a.isSelf ? (
                    <Badge variant="outline" className="rounded-none">
                      {tr("al.self")}
                    </Badge>
                  ) : null}
                  {a.flagged ? (
                    <Badge variant="destructive" className="rounded-none">
                      {tr("al.flagged")}
                    </Badge>
                  ) : null}
                  <Badge variant={a.status === "OUTSTANDING" ? "destructive" : "neutral"} className="rounded-none">
                    {status}
                  </Badge>
                  <span className={cn("bal", `bal-${balanceTone(a.ownerBalancePaisa)}`)}>
                    {tr("al.adv.col.balance")} {signedMoney(locale, a.ownerBalancePaisa)} · {balanceWord(a.ownerBalancePaisa)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="muted m-0">{tr("al.adv.footer", { mult: multiplierText(locale, multiplierPct) })}</p>
    </section>
  );
}
