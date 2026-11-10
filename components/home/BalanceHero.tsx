import { ArrowRightIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { distributionHref } from "@/components/distribution/format";
import { balanceTone, ownerHref, percent } from "@/components/owners/format";
import { Button } from "@/components/ui/button";
import { translator, type Locale, type MessageKey } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/paths";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import type { HomeMonthDto, MeDto } from "./types";

/** Balance hero: amount, word tag, share, sentence, loan line, My statement (F2, G14, Rule 3). */
export function BalanceHero({ locale, me, month }: { locale: Locale; me: MeDto; month: HomeMonthDto | null }) {
  const tr = translator(locale);
  const tone = balanceTone(me.balancePaisa);
  const loan = me.loan;
  return (
    <section aria-labelledby="hero-title" className="home-hero">
      <p id="hero-title" className="kicker">
        {tr("home.hero.kicker")}
      </p>
      <p className={`hero-amount bal-${tone}`} data-testid="hero-amount">
        {formatMoney(locale, me.balancePaisa)}
      </p>
      <p className="m-0 flex flex-wrap items-center gap-2">
        <span className={`bal-tag bal-${tone}`}>{tr(`owners.balance.${me.balanceLabel}` as MessageKey)}</span>
        {me.sharePercent !== null ? <span className="font-semibold">{tr("home.hero.share", { percent: percent(locale, me.sharePercent) })}</span> : null}
      </p>
      <p className="hero-note">{tr(`home.hero.${me.balanceLabel}` as MessageKey)}</p>
      {loan ? (
        <p className="hero-note">
          {loan.nextDeductionPaisa !== null && loan.nextDeductionMonth
            ? tr("home.hero.loan", {
                number: loan.number,
                left: formatMoney(locale, loan.outstandingPaisa),
                next: formatMoney(locale, loan.nextDeductionPaisa),
                month: monthLabel(locale, loan.nextDeductionMonth),
              })
            : tr("home.hero.loanNoNext", { number: loan.number, left: formatMoney(locale, loan.outstandingPaisa) })}
        </p>
      ) : null}
      {month?.firstMonth ? <p className="hero-note">{tr("home.hero.firstMonth", { month: monthLabel(locale, month.key) })}</p> : null}
      <Button asChild variant="ghost" className="self-start pl-0">
        <Link href={ownerHref(locale, me.ownerId)}>
          {tr("home.hero.statement")}
          <ArrowRightIcon data-icon="inline-end" />
        </Link>
      </Button>
    </section>
  );
}

function Row({ href, label, value, muted }: { href: string; label: string; value: string; muted?: boolean }) {
  return (
    <li>
      <Link href={href} className="home-row">
        <span className="kicker">{label}</span>
        <span className={muted ? "muted" : "home-row-value"}>{value}</span>
      </Link>
    </li>
  );
}

/** Entitlement (preview) · Received · Advances (when any) · Loan outstanding (F3, G3, F12). */
export function ThisMonth({ locale, me, month }: { locale: Locale; me: MeDto; month: HomeMonthDto | null }) {
  const tr = translator(locale);
  const money = (p: number) => formatMoney(locale, p);
  const statement = ownerHref(locale, me.ownerId);
  return (
    <section aria-labelledby="me-title">
      <h2 id="me-title" className="sr-only">
        {tr("home.me.title")}
      </h2>
      <ul className="home-rows" aria-label={tr("home.me.title")}>
        {month ? (
          <Row
            href={distributionHref(locale, month.key)}
            label={`${tr("home.me.entitlement", { month: monthLabel(locale, month.key) })}${month.open ? ` ${tr("home.me.preview")}` : ""}`}
            value={me.entitlementPreviewPaisa === null ? (me.sharePercent === null ? tr("home.me.noShare") : "—") : money(me.entitlementPreviewPaisa)}
            muted={me.entitlementPreviewPaisa === null}
          />
        ) : null}
        <Row href={statement} label={tr("home.me.received")} value={money(me.receivedPaisa)} />
        {me.advancesPaisa > 0 ? <Row href={statement} label={tr("home.me.advances")} value={money(me.advancesPaisa)} /> : null}
        <Row href={localePath(locale, "/advances")} label={tr("home.me.loan")} value={me.loanOutstandingPaisa > 0 ? money(me.loanOutstandingPaisa) : tr("home.me.none")} />
      </ul>
    </section>
  );
}
