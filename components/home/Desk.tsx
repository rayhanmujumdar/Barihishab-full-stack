import { ArrowRightIcon, CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { num } from "@/components/owners/format";
import { requestsHref } from "@/components/requests/format";
import { Button } from "@/components/ui/button";
import { translator, type Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/paths";
import { formatMoney } from "@/lib/money";
import { ReconciliationDetails } from "./ReconciliationDetails";
import type { DeskDto } from "./types";

function TileLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button asChild variant="ghost" className="mt-auto self-start pl-0">
      <Link href={href}>
        {children}
        <ArrowRightIcon data-icon="inline-end" />
      </Link>
    </Button>
  );
}

/** Bookkeeper's desk: House fund · Reconciliation · Pending requests · Open complaints · Invites waiting (F5, G8, G9). */
export function Desk({ locale, desk }: { locale: Locale; desk: DeskDto }) {
  const tr = translator(locale);
  const money = (p: number) => formatMoney(locale, p);
  const r = desk.reconciliation;
  const balanced = r.status === "BALANCED";
  const { pending, invites } = desk;
  return (
    <section aria-labelledby="desk-title">
      <div className="section-head">
        <h2 id="desk-title">{tr("home.desk.title")}</h2>
        <span className="kicker">{tr("home.desk.adminOnly")}</span>
      </div>
      <div className="desk-grid">
        <div className="desk-tile">
          <p className="kicker">{tr("home.desk.fund")}</p>
          <p className="stat-value" data-testid="fund-total">
            {money(desk.fund.totalPaisa)}
          </p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
            {desk.fund.accounts.map((a) => (
              <li key={a.id} className="flex justify-between gap-3">
                <span className="min-w-0 truncate text-[var(--color-neutral-700)]">{a.name}</span>
                <span className="font-extrabold tabular-nums">{money(a.balancePaisa)}</span>
              </li>
            ))}
          </ul>
          <TileLink href={localePath(locale, "/settings")}>{tr("home.desk.fundLink")}</TileLink>
        </div>

        <div className="desk-tile">
          <p className="kicker">{tr("home.desk.recon")}</p>
          <p className="m-0 flex items-center gap-2 text-xl">
            {balanced ? <CheckCircleIcon className="bal-pos size-6" aria-hidden /> : <ExclamationTriangleIcon className="bal-neg size-6" aria-hidden />}
            <span className={`font-extrabold ${balanced ? "bal-pos" : "bal-neg"}`}>{tr(balanced ? "home.desk.balanced" : "home.desk.check")}</span>
          </p>
          <p className="m-0 font-semibold">{balanced ? tr("home.desk.balancedNote") : tr("home.desk.mismatch", { amount: money(Math.abs(r.mismatchPaisa)) })}</p>
          <p className="muted m-0 text-[12px]">{tr("home.desk.formula")}</p>
          <ReconciliationDetails locale={locale} reconciliation={r} />
        </div>

        <div className="desk-tile">
          <p className="kicker">{tr("home.desk.pending")}</p>
          <p className="m-0">
            <span className="count-box" data-testid="pending-count" data-signal={pending.count > 0 ? "true" : "false"}>
              {num(locale, pending.count)}
            </span>
          </p>
          {pending.over3Days > 0 ? <p className="m-0 text-[13px] font-semibold">{tr("home.desk.over3", { count: num(locale, pending.over3Days) })}</p> : null}
          <TileLink href={requestsHref(locale, { tab: "decide" })}>{tr("home.desk.reviewQueue")}</TileLink>
        </div>

        <div className="desk-tile">
          <p className="kicker">{tr("home.desk.complaints")}</p>
          <p className="stat-value" data-testid="complaints-count">
            {num(locale, desk.openComplaints)}
          </p>
        </div>

        <div className="desk-tile">
          <p className="kicker">{tr("home.desk.pendingInvites")}</p>
          <p className="stat-value" data-testid="invites-count">
            {num(locale, invites.waiting)}
          </p>
          {invites.expired > 0 ? <p className="bal-neg m-0 text-[13px] font-semibold">{tr(invites.expired === 1 ? "home.desk.expired1" : "home.desk.expiredMany", { count: num(locale, invites.expired) })}</p> : null}
          <TileLink href={localePath(locale, "/admin/users")}>{tr("home.desk.manageUsers")}</TileLink>
        </div>
      </div>
    </section>
  );
}
