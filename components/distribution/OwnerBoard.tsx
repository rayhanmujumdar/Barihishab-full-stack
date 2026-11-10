import { CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { balanceText, balanceTone, num, ownerHref, percent } from "@/components/owners/format";
import { translator, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { BoardRow, DistributionDto } from "./types";
import { OwnerAvatar } from "@/components/owners/OwnerAvatar";

type Props = { locale: Locale; data: DistributionDto; canPay: boolean; onPay: (row: BoardRow) => void };

const dash = (locale: Locale, paisa: number) => (paisa === 0 ? "—" : formatMoney(locale, paisa));

function Balance({ locale, row }: { locale: Locale; row: BoardRow }) {
  const b = balanceText(locale, row.balanceLabel, row.balancePaisa);
  return (
    <span className={cn("bal-tag", `bal-${balanceTone(row.balancePaisa)}`)}>
      {b.amount ? `${b.amount} · ` : ""}
      {b.word}
    </span>
  );
}

/** Every owner's share for the month: table on desktop, cards on phones (F3, G8, G10, G13). */
export function OwnerBoard({ locale, data, canPay, onPay }: Props) {
  const tr = translator(locale);
  const open = data.month.status === "OPEN";
  const showOther = data.rows.some((r) => r.otherPaisa !== 0);
  const month = data.month.key;
  const statementHref = (id: string) => ownerHref(locale, id, { from: month, to: month });
  const payable = (r: BoardRow) => canPay && r.balancePaisa > 0;
  const share = (r: BoardRow) => (r.sharePercent === null ? "—" : `${percent(locale, r.sharePercent)} · ${num(locale, r.units)}`);
  const otherHead = (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1" tabIndex={0}>
          {tr("dist.col.other")}
          <InformationCircleIcon className="size-3.5" aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent>{tr("dist.otherTip")}</TooltipContent>
    </Tooltip>
  );

  return (
    <section aria-labelledby="board-title" className="flex flex-col">
      <div className="section-head">
        <h2 id="board-title">{tr("dist.board")}</h2>
      </div>

      <div className="st-wrap dist-table-wrap">
        <table className="st-table dist-table">
          <thead>
            <tr>
              <th scope="col">{tr("dist.col.owner")}</th>
              <th scope="col" className="num">{tr("dist.col.share")}</th>
              <th scope="col" className="num">{tr("dist.col.opening")}</th>
              <th scope="col" className="num">{tr(open ? "dist.col.entitlementPreview" : "dist.col.entitlement")}</th>
              <th scope="col" className="num">{tr("dist.col.received")}</th>
              <th scope="col" className="num">{tr("dist.col.advance")}</th>
              <th scope="col" className="num">{tr("dist.col.loanDed")}</th>
              {showOther ? <th scope="col" className="num">{otherHead}</th> : null}
              <th scope="col">{tr(open ? "dist.col.balanceNow" : "dist.col.balance")}</th>
              <th scope="col" className="num">{tr("dist.col.loan")}</th>
              {canPay ? <th scope="col"><span className="sr-only">{tr("dist.col.action")}</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.ownerId} data-viewer={r.isViewer ? "true" : undefined}>
                <th scope="row" className="text-left">
                  <Link href={statementHref(r.ownerId)} className="inline-flex items-center gap-2 font-bold text-foreground">
                    <OwnerAvatar initials={r.initials} avatarUrl={r.avatarUrl} style={{ width: 28, height: 28, fontSize: 11 }} />
                    {r.displayName}
                  </Link>
                  {r.isViewer ? (
                    <Badge variant="accent" className="ml-2">
                      {tr("dist.you")}
                    </Badge>
                  ) : null}
                </th>
                <td className="num">{share(r)}</td>
                <td className="num">{formatMoney(locale, r.openingPaisa)}</td>
                <td className="num">{formatMoney(locale, r.entitlementPaisa)}</td>
                <td className="num">{dash(locale, r.receivedPaisa)}</td>
                <td className="num">{dash(locale, r.advancePaisa)}</td>
                <td className="num">{dash(locale, r.loanDeductionPaisa)}</td>
                {showOther ? <td className="num">{dash(locale, r.otherPaisa)}</td> : null}
                <td>
                  <Balance locale={locale} row={r} />
                  {r.afterClosePaisa !== null ? <div className="muted">{tr("dist.afterClose", { amount: formatMoney(locale, r.afterClosePaisa) })}</div> : null}
                </td>
                <td className="num">{dash(locale, r.loanOutstandingPaisa)}</td>
                {canPay ? (
                  <td>
                    {payable(r) ? (
                      <Button size="sm" variant="outline" onClick={() => onPay(r)} aria-label={tr("dist.payName", { name: r.displayName })}>
                        {tr("dist.pay")}
                      </Button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="text-left">{tr("dist.total")}</th>
              <td />
              <td />
              <td className="num">{formatMoney(locale, data.totals.entitlementPaisa)}</td>
              <td className="num">{formatMoney(locale, data.totals.receivedPaisa)}</td>
              <td className="num">{formatMoney(locale, data.totals.advancePaisa)}</td>
              <td className="num">{formatMoney(locale, data.totals.loanDeductionPaisa)}</td>
              {showOther ? <td className="num">{formatMoney(locale, data.totals.otherPaisa)}</td> : null}
              <td />
              <td />
              {canPay ? <td /> : null}
            </tr>
          </tfoot>
        </table>
      </div>

      <ul className="dist-cards" aria-label={tr("dist.board")}>
        {data.rows.map((r) => (
          <li key={r.ownerId} className="dist-card" data-viewer={r.isViewer ? "true" : undefined}>
            <div className="flex items-start justify-between gap-3">
              <Link href={statementHref(r.ownerId)} className="flex min-w-0 items-center gap-2 font-bold text-foreground">
                <OwnerAvatar initials={r.initials} avatarUrl={r.avatarUrl} />
                <span className="min-w-0">
                  <span className="block truncate">{r.displayName}</span>
                  <span className="muted block font-normal">{share(r)}</span>
                </span>
              </Link>
              <div className="flex flex-col items-end gap-1">
                {r.isViewer ? <Badge variant="accent">{tr("dist.you")}</Badge> : null}
                <Balance locale={locale} row={r} />
              </div>
            </div>
            <dl className="dist-card-grid">
              <div>
                <dt>{tr("dist.col.opening")}</dt>
                <dd>{formatMoney(locale, r.openingPaisa)}</dd>
              </div>
              <div>
                <dt>{tr(open ? "dist.col.entitlementPreview" : "dist.col.entitlement")}</dt>
                <dd>{formatMoney(locale, r.entitlementPaisa)}</dd>
              </div>
              <div>
                <dt>{tr("dist.col.received")}</dt>
                <dd>{dash(locale, r.receivedPaisa)}</dd>
              </div>
              <div>
                <dt>{tr("dist.col.advance")}</dt>
                <dd>{dash(locale, r.advancePaisa)}</dd>
              </div>
              <div>
                <dt>{tr("dist.col.loanDed")}</dt>
                <dd>{dash(locale, r.loanDeductionPaisa)}</dd>
              </div>
              <div>
                <dt>{tr("dist.col.loan")}</dt>
                <dd>{dash(locale, r.loanOutstandingPaisa)}</dd>
              </div>
            </dl>
            {r.afterClosePaisa !== null ? <p className="muted m-0">{tr("dist.afterClose", { amount: formatMoney(locale, r.afterClosePaisa) })}</p> : null}
            {payable(r) ? (
              <Button className="w-full justify-between" onClick={() => onPay(r)}>
                {tr("dist.payAmount", { amount: formatMoney(locale, r.balancePaisa) })}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      <AccuracyFooter locale={locale} data={data} />
    </section>
  );
}

/** Σ entitlements = distributable, shares used, rounding method (F4). */
export function AccuracyFooter({ locale, data }: { locale: Locale; data: DistributionDto }) {
  const tr = translator(locale);
  const f = data.footer;
  const list = f.shares.map((s) => `${s.name} ${num(locale, s.units)}`).join(" · ");
  return (
    <ul className="dist-foot" aria-label={tr("dist.footer.rounding")}>
      {f.balanced ? (
        <li className="bal-pos flex items-center gap-1.5 font-semibold">
          <CheckCircleIcon className="size-4" aria-hidden />
          {tr("dist.footer.balanced", { sum: formatMoney(locale, f.sumEntitlementsPaisa), dist: formatMoney(locale, f.distributablePaisa) })}
        </li>
      ) : (
        <li className="bal-neg flex items-center gap-1.5 font-semibold" role="alert">
          <ExclamationTriangleIcon className="size-4" aria-hidden />
          {tr("dist.footer.mismatch")}
        </li>
      )}
      {list ? <li className="muted">{tr("dist.footer.shares", { list })}</li> : null}
      <li className="muted flex items-center gap-1">
        {tr("dist.footer.rounding")}
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="inline-grid size-6 place-items-center" aria-label={tr("dist.footer.roundingTip")}>
              <InformationCircleIcon className="size-4" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent>{tr("dist.footer.roundingTip")}</TooltipContent>
        </Tooltip>
      </li>
      {data.skippedLoans.map((s) => (
        <li key={s.ownerId} className="muted">
          {tr("dist.skipped", { name: s.displayName })}
        </li>
      ))}
    </ul>
  );
}
