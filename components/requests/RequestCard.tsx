"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { shortDate } from "@/components/loans/format";
import { translator, type Locale, type MessageKey } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/periods/month";
import { cn } from "@/lib/utils";
import { reqNumber, typeLabel } from "./format";
import type { DecisionContext, RequestDto, RequestPerms, RequestStatus } from "./types";

export type RequestOpen =
  | { kind: "new" | "record" }
  | { kind: "edit" | "approve" | "reject" | "withdraw" | "disburse" | "cancel"; request: RequestDto }
  | null;

/** Pending is an outline, Approved the one yellow fill, the rest neutral (§4). */
export function RequestStatusTag({ locale, status }: { locale: Locale; status: RequestStatus }) {
  const tr = translator(locale);
  const label = tr(`req.status.${status}` as MessageKey);
  if (status === "PENDING") return <Badge variant="outline" className="rounded-none border-foreground">{label}</Badge>;
  if (status === "APPROVED") return <Badge className="rounded-none bg-[var(--signal)] text-foreground">{label}</Badge>;
  return <Badge variant="neutral" className="rounded-none">{label}</Badge>;
}

const DISBURSE_KEY: Record<RequestDto["type"], MessageKey> = { ADVANCE: "req.disburse.ADVANCE", LOAN: "req.disburse.LOAN", GRANT: "req.disburse.GRANT" };

/** Owner balance with its word, never colour alone. */
function Balance({ locale, paisa }: { locale: Locale; paisa: number }) {
  const tr = translator(locale);
  const tone = paisa > 0 ? "bal-pos" : paisa < 0 ? "bal-neg" : "";
  return (
    <span className={cn("font-extrabold", tone)}>
      {formatMoney(locale, paisa)} <span className="text-xs font-semibold">{tr(paisa > 0 ? "req.ctx.owed" : paisa < 0 ? "req.ctx.advance" : "req.ctx.settled")}</span>
    </span>
  );
}

/** F4: balance, loans, limit, House Fund + type-specific figures and warnings. */
export function ContextPanel({ locale, context }: { locale: Locale; context: DecisionContext }) {
  const tr = translator(locale);
  const m = (p: number) => formatMoney(locale, p);
  return (
    <div className="flex flex-col gap-3 bg-[var(--color-bg)] p-3" aria-label={tr("req.ctx.title")}>
      <dl className="kv m-0">
        <dt>{tr("req.ctx.balance")}</dt>
        <dd>
          <Balance locale={locale} paisa={context.balancePaisa} />
        </dd>
        <dt>{tr("req.ctx.loans")}</dt>
        <dd>{context.loanOutstandingPaisa ? m(context.loanOutstandingPaisa) : tr("req.none")}</dd>
        <dt>{tr("req.ctx.limit")}</dt>
        <dd>{context.advanceLimitPaisa === null ? tr("req.ctx.noLimit") : tr("req.ctx.limitUsed", { limit: m(context.advanceLimitPaisa), used: m(context.advanceUsedPaisa) })}</dd>
        <dt>{tr("req.ctx.fund")}</dt>
        <dd>{m(context.houseFundPaisa)}</dd>
      </dl>
      {context.advance ? (
        <p className="m-0 text-sm">
          {tr("req.ctx.advanceAfter", { before: m(context.advance.usedBeforePaisa), after: m(context.advance.usedAfterPaisa) })}
          {context.advance.overLimit ? <strong className="bal-neg block">{tr("req.warn.overLimit")}</strong> : null}
        </p>
      ) : null}
      {context.loan ? (
        <div className="text-sm">
          {context.loan.activeLoans.length ? (
            <ul className="m-0 list-none p-0">
              {context.loan.activeLoans.map((l) => (
                <li key={l.id}>{tr("req.ctx.loanLeft", { loan: tr("al.loanNo", { n: l.number }), amount: m(l.outstandingPaisa) })}</li>
              ))}
            </ul>
          ) : (
            <p className="m-0">{tr("req.ctx.noLoans")}</p>
          )}
          {context.loan.finishesWithin24Months !== null ? (
            <p className={cn("m-0 font-semibold", !context.loan.finishesWithin24Months && "bal-neg")}>{tr(context.loan.finishesWithin24Months ? "req.ctx.planOk" : "req.ctx.planLong")}</p>
          ) : null}
        </div>
      ) : null}
      {context.grant ? (
        <div className="text-sm">
          <p className="m-0 font-semibold">{tr("req.ctx.grantDrop", { month: monthLabel(locale, context.grant.month), amount: m(context.grant.dropPaisa) })}</p>
          <ul className="m-0 list-none p-0">
            {context.grant.owners.map((o) => (
              <li key={o.ownerId} className="flex justify-between gap-2">
                <span>{o.name}</span>
                <span className="tabular-nums">−{m(o.dropPaisa)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {context.pendingOthers.length ? <p className="bal-neg m-0 text-sm font-semibold">{tr("req.warn.pending", { number: context.pendingOthers.map((n) => reqNumber(locale, n)).join(", ") })}</p> : null}
      {context.aboveHouseFund ? <p className="bal-neg m-0 text-sm font-semibold">{tr("req.warn.aboveFund", { amount: m(context.houseFundPaisa) })}</p> : null}
    </div>
  );
}

/** One request (§2.1): tags, dates, owner · type, reason, admin note, amounts and the actions this viewer may take. */
export function RequestCard({
  locale,
  request: r,
  perms,
  openMonth,
  context,
  onOpen,
  onAction,
}: {
  locale: Locale;
  request: RequestDto;
  perms: RequestPerms;
  openMonth: string | null;
  context?: DecisionContext;
  onOpen: () => void;
  onAction: (o: RequestOpen) => void;
}) {
  const tr = translator(locale);
  const money = (p: number) => formatMoney(locale, p);
  const lower = r.amountApprovedPaisa !== null && r.amountApprovedPaisa < r.amountRequestedPaisa;
  const decision = r.status === "PENDING" && perms.decide;
  const ownCancel = r.mine && (r.status === "PENDING" || r.status === "APPROVED");
  const shown = r.limited ? (r.amountApprovedPaisa ?? r.amountRequestedPaisa) : r.amountRequestedPaisa;
  return (
    <article className="flex flex-col gap-3 border-t-2 border-foreground bg-[var(--color-surface)] p-4" aria-labelledby={`req-${r.id}`} data-status={r.status}>
      <div className={cn("grid gap-4", decision && context ? "md:grid-cols-[1fr_minmax(260px,320px)]" : "")}>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <RequestStatusTag locale={locale} status={r.status} />
            {r.overdue ? <Badge variant="destructive" className="rounded-none">{tr("req.tag.overdue")}</Badge> : null}
            {r.isSelf && r.status !== "PENDING" ? <Badge variant="outline" className="rounded-none">{tr("req.tag.selfApproved")}</Badge> : null}
            {r.isSelf && r.status === "PENDING" && perms.decide ? <span className="text-xs font-semibold">{tr("req.tag.yourOwn")}</span> : null}
            {r.linkedEntry?.voided ? <Badge variant="neutral" className="rounded-none">{tr("req.tag.voided")}</Badge> : null}
            <span className="muted text-xs">{reqNumber(locale, r.number)}</span>
          </div>
          <p className="muted m-0 text-sm">
            {r.limited ? tr("req.paidOn", { date: shortDate(locale, r.askedOn) }) : tr("req.dates", { asked: shortDate(locale, r.askedOn), needed: shortDate(locale, r.neededBy) })}
          </p>
          <h3 id={`req-${r.id}`} className="m-0 text-2xl font-extrabold tracking-[-0.02em] tabular-nums">
            <button type="button" onClick={onOpen} className="cursor-pointer text-left underline-offset-4 hover:underline">
              {money(shown)} <span className="text-base font-semibold">· {typeLabel(locale, r.type)}</span>
            </button>
          </h3>
          <p className="m-0 font-semibold">{r.ownerName}</p>
          <p className="m-0">“{r.reason}”</p>
          {r.repaymentPlan ? <p className="muted m-0 text-sm">{tr("req.plan", { plan: r.repaymentPlan })}</p> : null}
          {r.recordedBy ? <p className="muted m-0 text-sm">{tr("req.recordedBy", { admin: r.recordedBy, owner: r.ownerName })}</p> : null}
          {lower && !r.limited ? <p className="m-0 font-semibold">{tr("req.approvedLower", { amount: money(r.amountApprovedPaisa!) })}</p> : null}
          {r.decisionNote ? <p className="m-0 text-sm">{tr("req.adminNote", { note: r.decisionNote })}</p> : null}
          {r.limited && r.decidedBy ? <p className="muted m-0 text-sm">{tr("req.approvedBy", { name: r.decidedBy })}</p> : null}
        </div>
        {decision && context ? <ContextPanel locale={locale} context={context} /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {decision ? (
          <>
            <Button onClick={() => onAction({ kind: "approve", request: r })}>{tr("req.approve")}</Button>
            <Button variant="outline" onClick={() => onAction({ kind: "reject", request: r })}>
              {tr("req.reject")}
            </Button>
          </>
        ) : null}
        {r.status === "APPROVED" && perms.disburse ? (
          <Button onClick={() => onAction({ kind: "disburse", request: r })} disabled={!openMonth} title={openMonth ? undefined : tr("req.err.noMonth")}>
            {tr(DISBURSE_KEY[r.type])}
          </Button>
        ) : null}
        {r.status === "APPROVED" && perms.decide ? (
          <Button variant="outline" onClick={() => onAction({ kind: "withdraw", request: r })}>
            {tr("req.withdraw")}
          </Button>
        ) : null}
        {r.mine && r.status === "PENDING" ? (
          <Button variant="outline" onClick={() => onAction({ kind: "edit", request: r })}>
            {tr("req.edit")}
          </Button>
        ) : null}
        {ownCancel ? (
          <Button variant="ghost" onClick={() => onAction({ kind: "cancel", request: r })}>
            {tr("req.cancelRequest")}
          </Button>
        ) : null}
      </div>
      {r.status === "APPROVED" && perms.disburse && !openMonth ? <p className="bal-neg m-0 text-sm font-semibold">{tr("req.err.noMonth")}</p> : null}
    </article>
  );
}
